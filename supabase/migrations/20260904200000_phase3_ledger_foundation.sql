-- Phase 3B: additive canonical financial and inventory ledger foundation.
-- Mutation remains server/RPC-only; this migration adds no browser write path.

create table public.sale_lines (
  id bigint generated always as identity primary key,
  sale_id bigint not null references public.sales(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  item_kind text not null check (item_kind in ('quick', 'inventory', 'other')),
  inventory_id integer references public.inventory(id) on delete restrict,
  quick_item_id integer references public.quick_items(id) on delete set null,
  name_snapshot text not null,
  variant_snapshot text not null default '',
  quantity integer not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  unit_cost_snapshot numeric(14,2) check (unit_cost_snapshot is null or unit_cost_snapshot >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  discount_reason text not null default '',
  line_total numeric(14,2) not null check (line_total >= 0),
  legacy_backfill boolean not null default false,
  legacy_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint sale_lines_sale_line_key unique (sale_id, line_number),
  constraint sale_lines_inventory_shape check (
    (item_kind = 'inventory' and inventory_id is not null)
    or (item_kind in ('quick', 'other') and inventory_id is null)
  )
);

create table public.payments (
  id bigint generated always as identity primary key,
  request_id uuid not null unique,
  sale_id bigint references public.sales(id) on delete restrict,
  repair_root_ticket_id bigint references public.tickets(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (length(trim(method)) > 0),
  cash_tendered numeric(14,2) check (cash_tendered is null or cash_tendered >= amount),
  change_given numeric(14,2) not null default 0 check (change_given >= 0),
  source text not null check (length(trim(source)) > 0),
  note text not null default '',
  created_by_auth_user_id uuid references auth.users(id) on delete restrict,
  legacy_backfill boolean not null default false,
  legacy_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint payments_one_commercial_family check (
    (sale_id is not null)::integer + (repair_root_ticket_id is not null)::integer = 1
  ),
  constraint payments_tender_change_shape check (
    (cash_tendered is null and change_given = 0)
    or (cash_tendered is not null and change_given = cash_tendered - amount)
  )
);

create table public.payment_allocations (
  id bigint generated always as identity primary key,
  payment_id bigint not null references public.payments(id) on delete restrict,
  sale_id bigint references public.sales(id) on delete restrict,
  ticket_id bigint references public.tickets(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  constraint payment_allocations_one_target check (
    (sale_id is not null)::integer + (ticket_id is not null)::integer = 1
  )
);

create unique index payment_allocations_payment_sale_key
  on public.payment_allocations (payment_id, sale_id)
  where sale_id is not null;
create unique index payment_allocations_payment_ticket_key
  on public.payment_allocations (payment_id, ticket_id)
  where ticket_id is not null;

create table public.refunds (
  id bigint generated always as identity primary key,
  request_id uuid not null unique,
  sale_id bigint references public.sales(id) on delete restrict,
  repair_root_ticket_id bigint references public.tickets(id) on delete restrict,
  return_id integer references public.returns(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (length(trim(method)) > 0),
  reason text not null check (length(trim(reason)) > 0),
  created_by_auth_user_id uuid references auth.users(id) on delete restrict,
  step_up_authorization_id uuid references public.step_up_authorizations(id) on delete restrict,
  legacy_backfill boolean not null default false,
  legacy_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint refunds_one_commercial_family check (
    (sale_id is not null)::integer + (repair_root_ticket_id is not null)::integer = 1
  ),
  constraint refunds_return_shape check (return_id is null or sale_id is not null)
);

create table public.invoice_adjustments (
  id bigint generated always as identity primary key,
  request_id uuid not null unique,
  repair_root_ticket_id bigint not null references public.tickets(id) on delete restrict,
  ticket_id bigint references public.tickets(id) on delete restrict,
  amount numeric(14,2) not null check (amount < 0),
  adjustment_type text not null check (
    adjustment_type in ('discount', 'price_correction', 'goodwill', 'cancelled_work', 'cancellation', 'other')
  ),
  reason text not null check (length(trim(reason)) > 0),
  created_by_auth_user_id uuid references auth.users(id) on delete restrict,
  step_up_authorization_id uuid references public.step_up_authorizations(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.credit_approvals (
  id bigint generated always as identity primary key,
  request_id uuid not null unique,
  sale_id bigint references public.sales(id) on delete restrict,
  repair_root_ticket_id bigint references public.tickets(id) on delete restrict,
  approved_amount numeric(14,2) not null check (approved_amount > 0),
  status text not null default 'Active' check (status in ('Active', 'Settled', 'Revoked')),
  approved_by_auth_user_id uuid references auth.users(id) on delete restrict,
  step_up_authorization_id uuid references public.step_up_authorizations(id) on delete restrict,
  legacy_backfill boolean not null default false,
  legacy_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint credit_approvals_one_commercial_family check (
    (sale_id is not null)::integer + (repair_root_ticket_id is not null)::integer = 1
  ),
  constraint credit_approvals_status_time check (
    (status = 'Active' and settled_at is null)
    or (status in ('Settled', 'Revoked') and settled_at is not null)
  ),
  constraint credit_approvals_actor_shape check (
    (legacy_backfill and approved_by_auth_user_id is null and step_up_authorization_id is null)
    or (not legacy_backfill and approved_by_auth_user_id is not null and step_up_authorization_id is not null)
  )
);

create table public.additional_work_proposals (
  id bigint generated always as identity primary key,
  request_id uuid not null unique,
  root_ticket_id bigint not null references public.tickets(id) on delete restrict,
  description text not null check (length(trim(description)) > 0),
  details jsonb not null default '{}'::jsonb,
  quoted_amount numeric(14,2) not null check (quoted_amount >= 0),
  decision text not null default 'Pending' check (decision in ('Pending', 'Approved', 'Declined')),
  decision_method text check (decision_method in ('Phone', 'In person', 'WhatsApp', 'Other')),
  decision_note text not null default '',
  created_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  decided_by_auth_user_id uuid references auth.users(id) on delete restrict,
  decided_at timestamptz,
  subinvoice_ticket_id bigint unique references public.tickets(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint additional_work_decision_shape check (
    (decision = 'Pending' and decision_method is null and decided_by_auth_user_id is null
      and decided_at is null and subinvoice_ticket_id is null)
    or (decision = 'Approved' and decision_method is not null and decided_by_auth_user_id is not null
      and decided_at is not null and subinvoice_ticket_id is not null)
    or (decision = 'Declined' and decision_method is not null and decided_by_auth_user_id is not null
      and decided_at is not null and subinvoice_ticket_id is null)
  )
);

create table public.return_lines (
  id bigint generated always as identity primary key,
  return_id integer not null references public.returns(id) on delete restrict,
  sale_line_id bigint not null references public.sale_lines(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  refund_amount numeric(14,2) not null check (refund_amount >= 0),
  restock boolean not null default false,
  created_at timestamptz not null default now(),
  constraint return_lines_return_sale_line_key unique (return_id, sale_line_id)
);

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  inventory_id integer not null references public.inventory(id) on delete restrict,
  movement_type text not null check (
    movement_type in ('opening_balance', 'sale', 'return_restock', 'restock', 'manual_adjustment')
  ),
  quantity_delta integer not null check (quantity_delta <> 0),
  sale_id bigint references public.sales(id) on delete restrict,
  return_id integer references public.returns(id) on delete restrict,
  reason text not null default '',
  created_by_auth_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint inventory_movements_request_item_type_key unique (request_id, inventory_id, movement_type),
  constraint inventory_movements_direction check (
    (movement_type = 'sale' and quantity_delta < 0)
    or (movement_type in ('opening_balance', 'return_restock', 'restock') and quantity_delta > 0)
    or movement_type = 'manual_adjustment'
  ),
  constraint inventory_movements_source_shape check (
    (movement_type = 'sale' and sale_id is not null and return_id is null)
    or (movement_type = 'return_restock' and return_id is not null and sale_id is not null)
    or (movement_type in ('opening_balance', 'restock', 'manual_adjustment') and sale_id is null and return_id is null)
  )
);

create index sale_lines_sale_id_idx on public.sale_lines (sale_id);
create index sale_lines_inventory_id_idx on public.sale_lines (inventory_id) where inventory_id is not null;
create index sale_lines_quick_item_id_idx on public.sale_lines (quick_item_id) where quick_item_id is not null;
create index payments_sale_id_created_idx on public.payments (sale_id, created_at) where sale_id is not null;
create index payments_repair_root_created_idx on public.payments (repair_root_ticket_id, created_at) where repair_root_ticket_id is not null;
create index payments_created_by_idx on public.payments (created_by_auth_user_id) where created_by_auth_user_id is not null;
create index payment_allocations_payment_id_idx on public.payment_allocations (payment_id);
create index payment_allocations_sale_id_idx on public.payment_allocations (sale_id) where sale_id is not null;
create index payment_allocations_ticket_id_idx on public.payment_allocations (ticket_id) where ticket_id is not null;
create index refunds_sale_id_created_idx on public.refunds (sale_id, created_at) where sale_id is not null;
create index refunds_repair_root_created_idx on public.refunds (repair_root_ticket_id, created_at) where repair_root_ticket_id is not null;
create index refunds_return_id_idx on public.refunds (return_id) where return_id is not null;
create index refunds_created_by_idx on public.refunds (created_by_auth_user_id) where created_by_auth_user_id is not null;
create index refunds_step_up_idx on public.refunds (step_up_authorization_id) where step_up_authorization_id is not null;
create index invoice_adjustments_ticket_id_idx on public.invoice_adjustments (ticket_id) where ticket_id is not null;
create index invoice_adjustments_repair_root_idx on public.invoice_adjustments (repair_root_ticket_id, created_at);
create index invoice_adjustments_created_by_idx on public.invoice_adjustments (created_by_auth_user_id) where created_by_auth_user_id is not null;
create index invoice_adjustments_step_up_idx on public.invoice_adjustments (step_up_authorization_id) where step_up_authorization_id is not null;
create index credit_approvals_sale_id_idx on public.credit_approvals (sale_id) where sale_id is not null;
create index credit_approvals_repair_root_idx on public.credit_approvals (repair_root_ticket_id) where repair_root_ticket_id is not null;
create index credit_approvals_step_up_idx on public.credit_approvals (step_up_authorization_id);
create index credit_approvals_approved_by_idx on public.credit_approvals (approved_by_auth_user_id) where approved_by_auth_user_id is not null;
create index additional_work_root_created_idx on public.additional_work_proposals (root_ticket_id, created_at);
create index additional_work_subinvoice_idx on public.additional_work_proposals (subinvoice_ticket_id) where subinvoice_ticket_id is not null;
create index additional_work_created_by_idx on public.additional_work_proposals (created_by_auth_user_id);
create index additional_work_decided_by_idx on public.additional_work_proposals (decided_by_auth_user_id) where decided_by_auth_user_id is not null;
create index return_lines_return_id_idx on public.return_lines (return_id);
create index return_lines_sale_line_id_idx on public.return_lines (sale_line_id);
create index inventory_movements_inventory_created_idx on public.inventory_movements (inventory_id, created_at);
create index inventory_movements_sale_id_idx on public.inventory_movements (sale_id) where sale_id is not null;
create index inventory_movements_return_id_idx on public.inventory_movements (return_id) where return_id is not null;
create index inventory_movements_created_by_idx on public.inventory_movements (created_by_auth_user_id) where created_by_auth_user_id is not null;

alter table public.sale_lines enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.refunds enable row level security;
alter table public.invoice_adjustments enable row level security;
alter table public.credit_approvals enable row level security;
alter table public.additional_work_proposals enable row level security;
alter table public.return_lines enable row level security;
alter table public.inventory_movements enable row level security;

revoke all on public.sale_lines, public.payments, public.payment_allocations,
  public.refunds, public.invoice_adjustments, public.credit_approvals,
  public.additional_work_proposals, public.return_lines,
  public.inventory_movements from anon, authenticated;
revoke all on sequence public.sale_lines_id_seq, public.payments_id_seq,
  public.payment_allocations_id_seq, public.refunds_id_seq,
  public.invoice_adjustments_id_seq, public.credit_approvals_id_seq,
  public.additional_work_proposals_id_seq, public.return_lines_id_seq,
  public.inventory_movements_id_seq from anon, authenticated;

grant select on public.sale_lines, public.payments, public.payment_allocations,
  public.refunds, public.invoice_adjustments, public.credit_approvals,
  public.return_lines to authenticated;
grant select on public.additional_work_proposals to authenticated;
grant select on public.inventory_movements to authenticated;

create policy sale_lines_select_financial_staff
  on public.sale_lines for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in
      ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
  );

create policy payments_select_financial_staff
  on public.payments for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in
      ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
  );

create policy payment_allocations_select_financial_staff
  on public.payment_allocations for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in
      ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
  );

create policy refunds_select_financial_staff
  on public.refunds for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in
      ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
  );

create policy invoice_adjustments_select_financial_staff
  on public.invoice_adjustments for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in
      ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
  );

create policy credit_approvals_select_financial_staff
  on public.credit_approvals for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in
      ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
  );

create policy additional_work_select_staff
  on public.additional_work_proposals for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in
      ('Business Owner', 'Manager', 'Cashier', 'Technician', 'Orbito Support')
  );

create policy return_lines_select_financial_staff
  on public.return_lines for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in
      ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
  );

create policy inventory_movements_select_admin
  on public.inventory_movements for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in
      ('Business Owner', 'Manager', 'Orbito Support')
  );

comment on table public.sale_lines is 'Canonical immutable retail line snapshots used for returns and inventory linkage.';
comment on table public.payments is 'Canonical immutable money-in events. One sale or one repair family per payment.';
comment on table public.payment_allocations is 'Immutable allocation of received money to one invoice obligation.';
comment on table public.refunds is 'Canonical immutable money-out events.';
comment on table public.invoice_adjustments is 'Immutable repair obligation reductions; original invoices remain unchanged.';
comment on table public.credit_approvals is 'Udhar authorization for ordinary outstanding balance, not a second balance ledger.';
comment on table public.additional_work_proposals is 'Durable customer decision record for proposed additional repair work.';
comment on table public.return_lines is 'Normalized partial retail return quantities and restock decisions.';
comment on table public.inventory_movements is 'Immutable audit trail for every Phase 3 tracked Inventory quantity change.';
