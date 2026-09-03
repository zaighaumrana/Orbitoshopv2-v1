-- Phase 2 final authorization cutover.
-- Apply only after real Owner/employee/Support Auth session smoke tests pass.

-- Remove every legacy allow-all policy.
drop policy if exists "allow all" on public.employees;
drop policy if exists "allow all" on public.inventory;
drop policy if exists "allow all" on public.returns;
drop policy if exists "allow all" on public.sales;
drop policy if exists "allow all" on public.shop_config;
drop policy if exists "allow all" on public.tickets;
drop policy if exists "allow all" on public.udhar;
drop policy if exists "anon full access" on public.password_reset_requests;
drop policy if exists anon_access on public.active_sessions;

alter table public.employees enable row level security;
alter table public.inventory enable row level security;
alter table public.quick_items enable row level security;
alter table public.repair_components enable row level security;
alter table public.tickets enable row level security;
alter table public.sales enable row level security;
alter table public.returns enable row level security;
alter table public.udhar enable row level security;
alter table public.attendance enable row level security;
alter table public.leaves enable row level security;
alter table public.salary_config enable row level security;
alter table public.salary_slips enable row level security;
alter table public.password_reset_requests enable row level security;
alter table public.shop_config enable row level security;
alter table public.support_access_log enable row level security;
alter table public.active_sessions enable row level security;

-- Data API table privileges are separate from RLS. Start from no browser
-- access, then grant only operations backed by policies below.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.app_users to authenticated;
grant select on public.employees to authenticated;
grant select, insert, update, delete on public.inventory to authenticated;
grant select, insert, update, delete on public.quick_items to authenticated;
grant select, insert, update, delete on public.repair_components to authenticated;
grant select, insert, update on public.tickets to authenticated;
grant select, insert on public.sales to authenticated;
grant select, insert on public.returns to authenticated;
grant select, insert, update on public.udhar to authenticated;
grant select, insert, update on public.attendance to authenticated;
grant select, insert, update on public.leaves to authenticated;
grant select, insert, update, delete on public.salary_config to authenticated;
grant select, insert, update, delete on public.salary_slips to authenticated;
grant select on public.password_reset_requests to authenticated;
grant select on public.support_access_log to authenticated;

grant usage, select on sequence public.inventory_id_seq to authenticated;
grant usage, select on sequence public.quick_items_id_seq to authenticated;
grant usage, select on sequence public.repair_components_id_seq to authenticated;
grant usage, select on sequence public.tickets_id_seq to authenticated;
grant usage, select on sequence public.sales_id_seq to authenticated;
grant usage, select on sequence public.returns_id_seq to authenticated;
grant usage, select on sequence public.udhar_id_seq to authenticated;
grant usage, select on sequence public.attendance_id_seq to authenticated;
grant usage, select on sequence public.leaves_id_seq to authenticated;
grant usage, select on sequence public.salary_config_id_seq to authenticated;
grant usage, select on sequence public.salary_slips_id_seq to authenticated;

create policy employees_select_authorized
  on public.employees for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (
      (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support')
      or id = (select app_private.current_employee_id())
    )
  );

create policy inventory_select_authorized
  on public.inventory for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
  );
create policy inventory_insert_admin
  on public.inventory for insert to authenticated
  with check (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support')
  );
create policy inventory_update_admin
  on public.inventory for update to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support')
  )
  with check (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support')
  );
create policy inventory_delete_admin
  on public.inventory for delete to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support')
  );

create policy quick_items_select_staff
  on public.quick_items for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Cashier', 'Technician', 'Orbito Support')
  );
create policy quick_items_insert_admin
  on public.quick_items for insert to authenticated
  with check (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support')
  );
create policy quick_items_update_admin
  on public.quick_items for update to authenticated
  using ((select app_private.current_client_access_allowed()) and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support'))
  with check ((select app_private.current_client_access_allowed()) and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support'));
create policy quick_items_delete_admin
  on public.quick_items for delete to authenticated
  using ((select app_private.current_client_access_allowed()) and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support'));

create policy repair_components_select_staff
  on public.repair_components for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Cashier', 'Technician', 'Orbito Support')
  );
create policy repair_components_insert_admin
  on public.repair_components for insert to authenticated
  with check ((select app_private.current_client_access_allowed()) and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support'));
create policy repair_components_update_admin
  on public.repair_components for update to authenticated
  using ((select app_private.current_client_access_allowed()) and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support'))
  with check ((select app_private.current_client_access_allowed()) and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support'));
create policy repair_components_delete_admin
  on public.repair_components for delete to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support')
  );

create policy tickets_select_staff
  on public.tickets for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Cashier', 'Technician', 'Orbito Support')
  );
create policy tickets_insert_counter
  on public.tickets for insert to authenticated
  with check (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
  );
create policy tickets_update_staff
  on public.tickets for update to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Cashier', 'Technician', 'Orbito Support')
  )
  with check (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Cashier', 'Technician', 'Orbito Support')
  );

create policy sales_select_authorized
  on public.sales for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
  );
create policy sales_insert_counter
  on public.sales for insert to authenticated
  with check (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
    and (
      (select app_private.current_app_role()) <> 'Cashier'
      or employee_id = (select app_private.current_employee_id())
    )
    and (coalesce(discount, 0) <= 0 or (select app_private.has_step_up('discount')))
    and (payment_method <> 'Udhar' or (select app_private.has_step_up('udhar')))
  );

create policy returns_select_authorized
  on public.returns for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
  );
create policy returns_insert_step_up
  on public.returns for insert to authenticated
  with check (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
    and (select app_private.has_step_up('return'))
    and (
      (select app_private.current_app_role()) <> 'Cashier'
      or processed_by = (select app_private.current_employee_id())
    )
  );

create policy udhar_select_authorized
  on public.udhar for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
  );
create policy udhar_insert_step_up
  on public.udhar for insert to authenticated
  with check (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
    and (select app_private.has_step_up('udhar'))
  );
create policy udhar_update_step_up
  on public.udhar for update to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
    and (select app_private.has_step_up('settle'))
  )
  with check (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
    and (select app_private.has_step_up('settle'))
  );

create policy attendance_select_self_or_admin
  on public.attendance for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (
      employee_id = (select app_private.current_employee_id())
      or (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support')
    )
  );
create policy attendance_insert_self
  on public.attendance for insert to authenticated
  with check (
    (select app_private.current_client_access_allowed())
    and employee_id = (select app_private.current_employee_id())
  );
create policy attendance_update_self_or_admin
  on public.attendance for update to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (employee_id = (select app_private.current_employee_id()) or (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support'))
  )
  with check (
    (select app_private.current_client_access_allowed())
    and (employee_id = (select app_private.current_employee_id()) or (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support'))
  );

create policy leaves_select_self_or_admin
  on public.leaves for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (employee_id = (select app_private.current_employee_id()) or (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support'))
  );
create policy leaves_insert_self
  on public.leaves for insert to authenticated
  with check (
    (select app_private.current_client_access_allowed())
    and employee_id = (select app_private.current_employee_id())
    and status = 'Pending'
  );
create policy leaves_update_admin
  on public.leaves for update to authenticated
  using ((select app_private.current_client_access_allowed()) and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support'))
  with check ((select app_private.current_client_access_allowed()) and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support'));

create policy salary_config_admin
  on public.salary_config for all to authenticated
  using ((select app_private.current_client_access_allowed()) and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support'))
  with check ((select app_private.current_client_access_allowed()) and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support'));
create policy salary_slips_admin
  on public.salary_slips for all to authenticated
  using ((select app_private.current_client_access_allowed()) and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support'))
  with check ((select app_private.current_client_access_allowed()) and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support'));

create policy password_resets_select_admin
  on public.password_reset_requests for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Manager', 'Orbito Support')
  );

create policy support_log_select_owner_support
  on public.support_access_log for select to authenticated
  using (
    (select app_private.current_client_access_allowed())
    and (select app_private.current_app_role()) in ('Business Owner', 'Orbito Support')
  );

create or replace function public.next_invoice_seq()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare new_seq integer;
begin
  if not app_private.current_client_access_allowed()
     or app_private.current_app_role() not in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support') then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  update public.shop_config
  set invoice_seq = invoice_seq + 1
  where id = 1
  returning invoice_seq into new_seq;
  return new_seq;
end;
$$;

create or replace function public.next_ticket_seq()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare new_seq integer;
begin
  if not app_private.current_client_access_allowed()
     or app_private.current_app_role() not in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support') then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  update public.shop_config
  set ticket_seq = ticket_seq + 1
  where id = 1
  returning ticket_seq into new_seq;
  return new_seq;
end;
$$;

revoke all on function public.next_invoice_seq() from public, anon;
revoke all on function public.next_ticket_seq() from public, anon;
grant execute on function public.next_invoice_seq() to authenticated, service_role;
grant execute on function public.next_ticket_seq() to authenticated, service_role;
