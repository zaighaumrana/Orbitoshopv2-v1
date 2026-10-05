-- Preserve the bridge operation/response contract; journal the request identity
-- already supplied by Platform. Legacy callers without an ID retain old behavior.
begin;
create table app_private.config_requests (
 request_id uuid primary key, changes jsonb not null, result jsonb not null,
 created_at timestamptz not null default now()
);
alter table app_private.config_requests enable row level security;
revoke all on app_private.config_requests from public,anon,authenticated;
grant select,insert on app_private.config_requests to service_role;
alter function public.bridge_onboarding(text,jsonb) rename to bridge_onboarding_v1;
create function public.bridge_onboarding(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare old app_private.config_requests%rowtype; response jsonb; request uuid;
begin
 if p_action<>'config-write' or not (p_payload ? 'request_id') then return public.bridge_onboarding_v1(p_action,p_payload); end if;
 request:=(p_payload->>'request_id')::uuid;
 if request is null then raise exception 'Configuration request identity required'; end if;
 -- Same lock order as the existing bridge. Durable replay never reapplies a
 -- previous write after a later successful operation.
 perform 1 from app_private.bridge_config where singleton for update;
 select * into old from app_private.config_requests where request_id=request;
 if found then
  if old.changes is distinct from p_payload->'changes' then raise exception 'Configuration request identity conflict'; end if;
  return old.result;
 end if;
 response:=public.bridge_onboarding_v1(p_action,p_payload);
 insert into app_private.config_requests(request_id,changes,result) values(request,p_payload->'changes',response);
 return response;
end $$;
revoke all on function public.bridge_onboarding_v1(text,jsonb),public.bridge_onboarding(text,jsonb) from public,anon,authenticated;
grant execute on function public.bridge_onboarding(text,jsonb) to service_role;
commit;
