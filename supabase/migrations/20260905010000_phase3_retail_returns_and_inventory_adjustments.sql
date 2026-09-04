-- Phase 3H: atomic retail returns/refunds and audited Inventory quantity changes.

alter table public.returns
  add column request_id uuid,
  add column refund_method text not null default '';

create unique index returns_request_id_key on public.returns(request_id)
  where request_id is not null;
create index returns_original_sale_id_idx on public.returns(original_sale_id);
create index returns_processed_by_idx on public.returns(processed_by)
  where processed_by is not null;

alter table public.inventory add column request_id uuid;
create unique index inventory_request_id_key on public.inventory(request_id)
  where request_id is not null;

create or replace function app_private.sale_line_gross_value(target_sale_line_id bigint)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
  with target as (
    select sl.*,s.tax,
      sum(sl.line_total) over(partition by sl.sale_id) as subtotal,
      max(sl.line_number) over(partition by sl.sale_id) as last_line
    from public.sale_lines sl
    join public.sales s on s.id=sl.sale_id
  )
  select round(t.line_total + case
    when coalesce(t.tax,0)=0 or coalesce(t.subtotal,0)=0 then 0
    when t.line_number=t.last_line then t.tax-coalesce((
      select sum(round(coalesce(s.tax,0)*other.line_total/nullif(t.subtotal,0),2))
      from public.sale_lines other
      join public.sales s on s.id=other.sale_id
      where other.sale_id=t.sale_id and other.line_number<>t.last_line
    ),0)
    else round(t.tax*t.line_total/nullif(t.subtotal,0),2)
  end,2)
  from target t where t.id=target_sale_line_id
$$;

revoke all on function app_private.sale_line_gross_value(bigint)
  from public,anon,authenticated;

create or replace function app_private.retail_return_result(
  target_return_id integer,
  replay boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'return',to_jsonb(r),
    'lines',coalesce((select jsonb_agg(to_jsonb(rl) order by rl.id)
      from public.return_lines rl where rl.return_id=r.id),'[]'::jsonb),
    'refund',(select to_jsonb(rf) from public.refunds rf where rf.return_id=r.id),
    'originalObligation',s.total_bill,
    'commercialReduction',coalesce((select sum(rl.refund_amount)
      from public.return_lines rl join public.returns rr on rr.id=rl.return_id
      where rr.original_sale_id=s.id),0),
    'effectiveObligation',greatest(0,s.total_bill-coalesce((select sum(rl.refund_amount)
      from public.return_lines rl join public.returns rr on rr.id=rl.return_id
      where rr.original_sale_id=s.id),0)),
    'paymentsReceived',coalesce((select sum(p.amount) from public.payments p where p.sale_id=s.id),0),
    'refundsPaid',coalesce((select sum(rf.amount) from public.refunds rf where rf.sale_id=s.id),0),
    'outstanding',greatest(0,
      s.total_bill-coalesce((select sum(rl.refund_amount)
        from public.return_lines rl join public.returns rr on rr.id=rl.return_id
        where rr.original_sale_id=s.id),0)
      -coalesce((select sum(p.amount) from public.payments p where p.sale_id=s.id),0)
      +coalesce((select sum(rf.amount) from public.refunds rf where rf.sale_id=s.id),0)),
    'idempotentReplay',replay
  )
  from public.returns r join public.sales s on s.id=r.original_sale_id
  where r.id=target_return_id
$$;

revoke all on function app_private.retail_return_result(integer,boolean)
  from public,anon,authenticated;

create or replace function public.get_retail_return_context(p_sale_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor public.app_users%rowtype;
  sale_row public.sales%rowtype;
begin
  select au.* into actor from public.app_users au
  where au.auth_user_id=(select auth.uid()) and au.status='Active';
  if actor.auth_user_id is null
    or actor.role not in ('Business Owner','Manager','Cashier','Orbito Support')
    or not app_private.current_client_access_allowed() then
    raise exception 'Retail return lookup is not authorized' using errcode='42501';
  end if;
  select s.* into sale_row from public.sales s where s.id=p_sale_id;
  if sale_row.id is null then
    raise exception 'Source sale not found' using errcode='22023';
  end if;
  return jsonb_build_object(
    'sale',jsonb_build_object('id',sale_row.id,'invoiceNumber',sale_row.invoice_number,
      'customerName',sale_row.customer_name,'createdAt',sale_row.created_at),
    'lines',coalesce((select jsonb_agg(jsonb_build_object(
      'saleLineId',sl.id,'itemKind',sl.item_kind,'inventoryId',sl.inventory_id,
      'name',sl.name_snapshot,'variantName',sl.variant_snapshot,
      'soldQuantity',sl.quantity,
      'alreadyReturned',coalesce(prior.quantity,0),
      'remainingQuantity',sl.quantity-coalesce(prior.quantity,0),
      'unitPrice',sl.unit_price,'lineTotal',sl.line_total,
      'grossLineValue',app_private.sale_line_gross_value(sl.id),
      'alreadyReduced',coalesce(prior.reduction,0),
      'remainingValue',app_private.sale_line_gross_value(sl.id)-coalesce(prior.reduction,0)
    ) order by sl.line_number) from public.sale_lines sl
      left join lateral (select sum(rl.quantity)::integer quantity,sum(rl.refund_amount) reduction
        from public.return_lines rl where rl.sale_line_id=sl.id) prior on true
      where sl.sale_id=sale_row.id),'[]'::jsonb),
    'financial',jsonb_build_object(
      'originalObligation',sale_row.total_bill,
      'commercialReduction',coalesce((select sum(rl.refund_amount)
        from public.return_lines rl join public.returns r on r.id=rl.return_id
        where r.original_sale_id=sale_row.id),0),
      'paymentsReceived',coalesce((select sum(p.amount) from public.payments p where p.sale_id=sale_row.id),0),
      'refundsPaid',coalesce((select sum(r.amount) from public.refunds r where r.sale_id=sale_row.id),0)
    )
  );
end;
$$;

create or replace function public.create_retail_return(
  p_request_id uuid,
  p_sale_id bigint,
  p_lines jsonb,
  p_refund_method text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.app_users%rowtype;
  sale_row public.sales%rowtype;
  existing_return_id integer;
  step_up_id uuid;
  line_value jsonb;
  sale_line public.sale_lines%rowtype;
  return_id_value integer;
  quantity_value integer;
  prior_quantity integer;
  prior_reduction numeric(14,2);
  line_gross numeric(14,2);
  reduction_value numeric(14,2);
  total_reduction numeric(14,2):=0;
  prior_total_reduction numeric(14,2);
  payments_value numeric(14,2);
  prior_refunds_value numeric(14,2);
  new_obligation numeric(14,2);
  net_paid numeric(14,2);
  refund_value numeric(14,2);
  outstanding_value numeric(14,2);
  restock_value boolean;
  compatibility_items jsonb:='[]'::jsonb;
  new_refund public.refunds%rowtype;
  inventory_row record;
  inventory_enabled boolean;
begin
  if p_request_id is null or p_sale_id is null
    or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0
    or jsonb_array_length(p_lines)>100 or trim(coalesce(p_reason,''))='' then
    raise exception 'Invalid retail return' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_lines) a
    group by a->>'saleLineId' having count(*)>1) then
    raise exception 'A sale line may appear only once per return' using errcode='22023';
  end if;
  select au.* into actor from public.app_users au
  where au.auth_user_id=(select auth.uid()) and au.status='Active';
  if actor.auth_user_id is null
    or actor.role not in ('Business Owner','Manager','Cashier','Orbito Support')
    or not app_private.current_client_access_allowed() then
    raise exception 'Retail return is not authorized' using errcode='42501';
  end if;
  select coalesce(sc.inventory_module_enabled,false) into inventory_enabled
    from public.shop_config sc where sc.id=1;
  select sua.id into step_up_id from public.step_up_authorizations sua
  where sua.auth_user_id=actor.auth_user_id and sua.purpose='return'
    and sua.expires_at>now() order by sua.created_at desc limit 1;
  if step_up_id is null then
    raise exception 'A valid return authorization is required' using errcode='42501';
  end if;
  select r.id into existing_return_id from public.returns r where r.request_id=p_request_id;
  if existing_return_id is not null then
    return app_private.retail_return_result(existing_return_id,true);
  end if;
  select s.* into sale_row from public.sales s where s.id=p_sale_id for update;
  if sale_row.id is null then
    raise exception 'Source sale not found' using errcode='22023';
  end if;

  perform 1 from public.sale_lines sl
  where sl.id in (select (value->>'saleLineId')::bigint from jsonb_array_elements(p_lines))
  order by sl.id for update;
  perform 1 from public.inventory i
  where i.id in (select sl.inventory_id from public.sale_lines sl
    where sl.id in (select (value->>'saleLineId')::bigint from jsonb_array_elements(p_lines))
      and sl.inventory_id is not null)
  order by i.id for update;

  for line_value in select value from jsonb_array_elements(p_lines)
  loop
    quantity_value:=(line_value->>'quantity')::integer;
    restock_value:=coalesce((line_value->>'restock')::boolean,false);
    select sl.* into sale_line from public.sale_lines sl
      where sl.id=(line_value->>'saleLineId')::bigint and sl.sale_id=p_sale_id;
    if sale_line.id is null or quantity_value is null or quantity_value<=0 then
      raise exception 'Invalid returned sale line' using errcode='22023';
    end if;
    select coalesce(sum(rl.quantity),0)::integer,coalesce(sum(rl.refund_amount),0)
      into prior_quantity,prior_reduction
    from public.return_lines rl where rl.sale_line_id=sale_line.id;
    if quantity_value>sale_line.quantity-prior_quantity then
      raise exception 'Return quantity exceeds the remaining sold quantity' using errcode='22023';
    end if;
    if restock_value and sale_line.item_kind<>'inventory' then
      raise exception 'Only tracked Inventory can return to sellable stock' using errcode='22023';
    end if;
    if restock_value and not inventory_enabled then
      raise exception 'Inventory module is not enabled' using errcode='42501';
    end if;
    line_gross:=app_private.sale_line_gross_value(sale_line.id);
    reduction_value:=case when quantity_value=sale_line.quantity-prior_quantity
      then round(line_gross-prior_reduction,2)
      else round(line_gross*quantity_value/sale_line.quantity,2) end;
    if reduction_value<0 or prior_reduction+reduction_value>line_gross then
      raise exception 'Returned value does not reconcile' using errcode='P0001';
    end if;
    total_reduction:=total_reduction+reduction_value;
    compatibility_items:=compatibility_items||jsonb_build_array(jsonb_build_object(
      'sale_line_id',sale_line.id,'name',sale_line.name_snapshot,
      'variant_name',sale_line.variant_snapshot,'qty',quantity_value,
      'sold_price',round(reduction_value/quantity_value,2),'restock',restock_value));
  end loop;
  total_reduction:=round(total_reduction,2);
  select coalesce(sum(rl.refund_amount),0) into prior_total_reduction
  from public.return_lines rl join public.returns r on r.id=rl.return_id
  where r.original_sale_id=p_sale_id;
  new_obligation:=round(sale_row.total_bill-prior_total_reduction-total_reduction,2);
  if new_obligation<0 then
    raise exception 'Return exceeds the sale obligation' using errcode='22023';
  end if;
  select coalesce(sum(p.amount),0) into payments_value from public.payments p where p.sale_id=p_sale_id;
  select coalesce(sum(r.amount),0) into prior_refunds_value from public.refunds r where r.sale_id=p_sale_id;
  net_paid:=round(payments_value-prior_refunds_value,2);
  refund_value:=round(greatest(0,net_paid-new_obligation),2);
  if refund_value>0 and trim(coalesce(p_refund_method,''))='' then
    raise exception 'Refund method is required when money is returned' using errcode='22023';
  end if;

  insert into public.returns(request_id,original_sale_id,returned_items,refund_amount,
    refund_method,processed_by,notes)
  values(p_request_id,p_sale_id,compatibility_items,refund_value,
    case when refund_value>0 then trim(p_refund_method) else '' end,
    actor.employee_id,trim(p_reason)) returning id into return_id_value;

  for line_value in select value from jsonb_array_elements(p_lines)
  loop
    quantity_value:=(line_value->>'quantity')::integer;
    restock_value:=coalesce((line_value->>'restock')::boolean,false);
    select sl.* into sale_line from public.sale_lines sl where sl.id=(line_value->>'saleLineId')::bigint;
    select coalesce(sum(rl.quantity),0)::integer,coalesce(sum(rl.refund_amount),0)
      into prior_quantity,prior_reduction from public.return_lines rl where rl.sale_line_id=sale_line.id;
    line_gross:=app_private.sale_line_gross_value(sale_line.id);
    reduction_value:=case when quantity_value=sale_line.quantity-prior_quantity
      then round(line_gross-prior_reduction,2)
      else round(line_gross*quantity_value/sale_line.quantity,2) end;
    insert into public.return_lines(return_id,sale_line_id,quantity,refund_amount,restock)
      values(return_id_value,sale_line.id,quantity_value,reduction_value,restock_value);
    if restock_value then
      update public.inventory set qty=qty+quantity_value where id=sale_line.inventory_id;
      insert into public.inventory_movements(request_id,inventory_id,movement_type,
        quantity_delta,sale_id,return_id,reason,created_by_auth_user_id)
      values(md5(p_request_id::text||':return-line:'||sale_line.id)::uuid,
        sale_line.inventory_id,'return_restock',quantity_value,p_sale_id,
        return_id_value,trim(p_reason),actor.auth_user_id);
    end if;
  end loop;
  if refund_value>0 then
    insert into public.refunds(request_id,sale_id,return_id,amount,method,reason,
      created_by_auth_user_id,step_up_authorization_id)
    values(md5(p_request_id::text||':refund')::uuid,p_sale_id,return_id_value,
      refund_value,trim(p_refund_method),trim(p_reason),actor.auth_user_id,step_up_id)
    returning * into new_refund;
  end if;
  outstanding_value:=round(greatest(0,new_obligation-net_paid+refund_value),2);
  if outstanding_value=0 then
    update public.credit_approvals set status='Settled',settled_at=now()
      where sale_id=p_sale_id and status='Active';
  end if;
  update public.udhar set total_amount=new_obligation,
    amount_paid=least(new_obligation,net_paid-refund_value),balance_due=outstanding_value,
    status=case when outstanding_value=0 then 'Settled' else 'Partial' end,
    settled_at=case when outstanding_value=0 then now() else null end
  where sale_id=p_sale_id;
  return app_private.retail_return_result(return_id_value,false);
end;
$$;

create or replace function app_private.protect_inventory_quantity()
returns trigger language plpgsql set search_path='' as $$
begin
  if current_user in ('anon','authenticated') and new.qty is distinct from old.qty then
    raise exception 'Inventory quantity requires an audited stock transaction' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function app_private.protect_inventory_quantity() from public,anon,authenticated;
create trigger inventory_protect_quantity before update on public.inventory
for each row execute function app_private.protect_inventory_quantity();

create or replace function public.create_inventory_item(
  p_request_id uuid,p_name text,p_sku text,p_category text,p_price numeric,
  p_cost numeric,p_initial_quantity integer,p_min_quantity integer
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.app_users%rowtype; item public.inventory%rowtype;
begin
  if p_request_id is null or trim(coalesce(p_name,''))=''
    or p_price is null or p_price<0 or p_cost is null or p_cost<0
    or p_initial_quantity is null or p_initial_quantity<0
    or p_min_quantity is null or p_min_quantity<0 then
    raise exception 'Invalid Inventory item' using errcode='22023';
  end if;
  select au.* into actor from public.app_users au
    where au.auth_user_id=(select auth.uid()) and au.status='Active';
  if actor.auth_user_id is null or actor.role not in ('Business Owner','Manager','Orbito Support')
    or not app_private.current_client_access_allowed()
    or not exists(select 1 from public.shop_config sc where sc.id=1 and sc.inventory_module_enabled) then
    raise exception 'Inventory creation is not authorized' using errcode='42501';
  end if;
  select i.* into item from public.inventory i where i.request_id=p_request_id;
  if item.id is not null then return jsonb_build_object('item',to_jsonb(item),'idempotentReplay',true); end if;
  insert into public.inventory(request_id,name,sku,category,price,cost,qty,min_qty)
  values(p_request_id,trim(p_name),trim(coalesce(p_sku,'')),trim(coalesce(p_category,'General')),
    round(p_price,2),round(p_cost,2),p_initial_quantity,p_min_quantity) returning * into item;
  if p_initial_quantity>0 then
    insert into public.inventory_movements(request_id,inventory_id,movement_type,quantity_delta,
      reason,created_by_auth_user_id)
    values(p_request_id,item.id,'opening_balance',p_initial_quantity,'Initial Inventory quantity',actor.auth_user_id);
  end if;
  return jsonb_build_object('item',to_jsonb(item),'idempotentReplay',false);
end;
$$;

create or replace function public.adjust_inventory_stock(
  p_request_id uuid,p_inventory_id integer,p_quantity_delta integer,
  p_movement_type text,p_reason text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.app_users%rowtype; item public.inventory%rowtype; movement public.inventory_movements%rowtype;
begin
  if p_request_id is null or p_inventory_id is null
    or p_quantity_delta is null or p_quantity_delta=0
    or p_movement_type not in ('restock','manual_adjustment')
    or (p_movement_type='restock' and p_quantity_delta<0)
    or trim(coalesce(p_reason,''))='' then
    raise exception 'Invalid Inventory adjustment' using errcode='22023';
  end if;
  select au.* into actor from public.app_users au
    where au.auth_user_id=(select auth.uid()) and au.status='Active';
  if actor.auth_user_id is null or actor.role not in ('Business Owner','Manager','Orbito Support')
    or not app_private.current_client_access_allowed()
    or not exists(select 1 from public.shop_config sc where sc.id=1 and sc.inventory_module_enabled) then
    raise exception 'Inventory adjustment is not authorized' using errcode='42501';
  end if;
  select im.* into movement from public.inventory_movements im
    where im.request_id=p_request_id and im.inventory_id=p_inventory_id
      and im.movement_type=p_movement_type;
  if movement.id is not null then
    select i.* into item from public.inventory i where i.id=p_inventory_id;
    return jsonb_build_object('item',to_jsonb(item),'movement',to_jsonb(movement),'idempotentReplay',true);
  end if;
  select i.* into item from public.inventory i where i.id=p_inventory_id for update;
  if item.id is null or item.qty+p_quantity_delta<0 then
    raise exception 'Inventory adjustment would create negative stock' using errcode='22023';
  end if;
  update public.inventory set qty=qty+p_quantity_delta where id=item.id returning * into item;
  insert into public.inventory_movements(request_id,inventory_id,movement_type,quantity_delta,
    reason,created_by_auth_user_id)
  values(p_request_id,item.id,p_movement_type,p_quantity_delta,trim(p_reason),actor.auth_user_id)
  returning * into movement;
  return jsonb_build_object('item',to_jsonb(item),'movement',to_jsonb(movement),'idempotentReplay',false);
end;
$$;

revoke insert on public.returns from authenticated;
revoke usage,select on sequence public.returns_id_seq from authenticated;
drop policy if exists returns_insert_step_up on public.returns;
revoke insert on public.inventory from authenticated;
revoke usage,select on sequence public.inventory_id_seq from authenticated;
drop policy if exists inventory_insert_admin on public.inventory;

revoke all on function public.get_retail_return_context(bigint) from public,anon;
grant execute on function public.get_retail_return_context(bigint) to authenticated,service_role;
revoke all on function public.create_retail_return(uuid,bigint,jsonb,text,text) from public,anon;
grant execute on function public.create_retail_return(uuid,bigint,jsonb,text,text) to authenticated,service_role;
revoke all on function public.create_inventory_item(uuid,text,text,text,numeric,numeric,integer,integer) from public,anon;
grant execute on function public.create_inventory_item(uuid,text,text,text,numeric,numeric,integer,integer) to authenticated,service_role;
revoke all on function public.adjust_inventory_stock(uuid,integer,integer,text,text) from public,anon;
grant execute on function public.adjust_inventory_stock(uuid,integer,integer,text,text) to authenticated,service_role;

comment on column public.returns.refund_amount is 'Compatibility snapshot of actual money refunded; commercial reductions are canonical in return_lines.refund_amount.';
comment on column public.returns.refund_method is 'Compatibility snapshot of the actual refund tender; empty when the return reduces debt only.';
comment on function public.create_retail_return(uuid,bigint,jsonb,text,text) is 'PIN-authorized atomic partial return, debt reduction, actual refund and optional Inventory restock.';
comment on function public.adjust_inventory_stock(uuid,integer,integer,text,text) is 'Audited non-sale Inventory restock or manual quantity correction.';
