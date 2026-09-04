-- Phase 3H follow-up: no return header may commit without at least one line.

create or replace function app_private.assert_return_has_lines()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if not exists(select 1 from public.return_lines rl where rl.return_id=new.id) then
    raise exception 'A retail return must contain at least one return line' using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function app_private.assert_return_has_lines()
  from public,anon,authenticated;

create constraint trigger returns_require_lines
after insert or update on public.returns
deferrable initially deferred
for each row execute function app_private.assert_return_has_lines();
