begin;
alter table app_private.paper_resupply_requests add column communication jsonb not null default '[]' check(jsonb_typeof(communication)='array');
create function public.bridge_apply_resupply_communication(p_source_id uuid,p_request_id uuid,p_version bigint,p_status text,p_updated_at timestamptz,p_communication jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare result text; old_messages jsonb; item jsonb; prior_revision bigint:=0;
begin
 -- Reuse source locking, monotonic revisions, terminal protection and service-only boundary.
 result:=public.bridge_apply_resupply(p_source_id,p_request_id,p_version,p_status,p_updated_at);
 if result='stale' then return result;end if;
 select communication into strict old_messages from app_private.paper_resupply_requests where request_id=p_request_id;
 if p_communication is null then return result;end if;
 if jsonb_typeof(p_communication)<>'array' or jsonb_array_length(p_communication)>10 then raise exception 'Invalid customer communication';end if;
 for item in select value from jsonb_array_elements(p_communication) loop
  if jsonb_typeof(item)<>'object' or item-array['status','revision','message','expectation','at']<>'{}'::jsonb
   or not(item ?& array['status','revision','message','expectation','at'])
   or item->>'status' not in ('approved','dispatched','fulfilled','rejected','cancelled')
   or jsonb_typeof(item->'message')<>'string' or jsonb_typeof(item->'expectation')<>'string'
   or length(item->>'message')>2000 or length(item->>'expectation')>200
   or (item->>'revision')::bigint<=prior_revision or (item->>'revision')::bigint>p_version
   or (item->>'at')::timestamptz is null then raise exception 'Invalid customer communication';end if;
  prior_revision:=(item->>'revision')::bigint;
 end loop;
 if jsonb_array_length(p_communication)>0 and ((p_communication->-1->>'status') is distinct from p_status
  or (p_communication->-1->>'revision')::bigint is distinct from p_version) then raise exception 'Communication revision mismatch';end if;
 if result='unchanged' and old_messages<>p_communication then raise exception 'Communication revision conflict';end if;
 -- A newer projection must retain every previously accepted decision.
 if not p_communication @> old_messages then raise exception 'Communication history lost';end if;
 update app_private.paper_resupply_requests set communication=p_communication where request_id=p_request_id;
 return result;
end $$;
revoke all on function public.bridge_apply_resupply_communication(uuid,uuid,bigint,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.bridge_apply_resupply_communication(uuid,uuid,bigint,text,timestamptz,jsonb) to service_role;

create or replace function public.get_platform_billing() returns jsonb
language plpgsql security definer set search_path='' as $$
declare projection app_private.billing_projection%rowtype; requests jsonb;
begin
 if auth.uid() is null or app_private.current_app_role() is distinct from 'Business Owner'
  or not app_private.current_client_access_allowed() then raise exception 'Business Owner access required' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into requests from (
  select request_id,requested_at,status,sync_version,platform_updated_at,communication from app_private.paper_resupply_requests order by requested_at desc limit 30) r;
 select * into projection from app_private.billing_projection where singleton;
 if not found then return jsonb_build_object('available',false,'paper_requests',requests);end if;
 return jsonb_build_object('available',true,'sync_version',projection.sync_version,'last_synced_at',projection.last_synced_at,'projection',projection.payload,'paper_requests',requests);
end $$;
commit;
