-- Additive Shop-owned submission journal. No network calls or implicit access grants.
create table app_private.support_submissions(
 request_id uuid primary key,actor_id uuid not null,accepted_session uuid not null,
 source_id uuid not null,client_binding text not null,client_id integer not null,
 fields jsonb not null,state text not null default 'pending' check(state in ('pending','sending','uncertain','acknowledged','review')),
 attempts integer not null default 0,lease_id uuid,lease_until timestamptz,
 next_attempt_at timestamptz not null default now(),ticket_id uuid,status text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index support_submissions_actor on app_private.support_submissions(actor_id,created_at desc);
create table app_private.support_delivery_events(id bigint generated always as identity primary key,request_id uuid not null references app_private.support_submissions(request_id),event text not null,actor_id uuid,at timestamptz not null default now(),reason text);
alter table app_private.support_submissions enable row level security;
alter table app_private.support_delivery_events enable row level security;
revoke all on app_private.support_submissions,app_private.support_delivery_events from public,anon,authenticated,service_role;

create function public.support_submission(p_request uuid,p_fields jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb:=public.support_ticket_actor_context();s app_private.support_submissions;
begin
 if p_request is null or jsonb_typeof(p_fields) is distinct from 'object' or p_fields-array['subject','category','message']<>'{}'::jsonb or jsonb_typeof(p_fields->'subject') is distinct from 'string' or jsonb_typeof(p_fields->'message') is distinct from 'string' or jsonb_typeof(p_fields->'category') is distinct from 'string' or octet_length(p_fields::text)>20000 or length(p_fields->>'subject')>160 or length(p_fields->>'message')>4000 or length(trim(p_fields->>'subject')) not between 1 and 160 or length(trim(p_fields->>'message')) not between 1 and 4000 or p_fields->>'category' not in ('technical','billing_question','account','other') then raise exception 'Invalid Support submission' using errcode='22023';end if;
 -- Serializes quotas and acceptance against this Shop's binding.
 perform 1 from app_private.bridge_config where singleton for update;
 a:=public.support_ticket_actor_context();
 select * into s from app_private.support_submissions where request_id=p_request for update;
 if found then
  if s.actor_id<>auth.uid() or s.source_id is distinct from (a->>'source_id')::uuid or s.client_binding is distinct from a->>'client_binding' or s.client_id is distinct from (a->>'platform_client_id')::integer or s.fields<>p_fields then raise exception 'Original submission conflict' using errcode='23505';end if;
 else
  if (select count(*) from app_private.support_submissions where actor_id=auth.uid() and created_at>now()-interval '1 hour')>=10 or (select count(*) from app_private.support_submissions where created_at>now()-interval '1 hour')>=50 then raise exception 'Submission limit' using errcode='PT429';end if;
  insert into app_private.support_submissions(request_id,actor_id,accepted_session,source_id,client_binding,client_id,fields) values(p_request,auth.uid(),(a->>'session_id')::uuid,(a->>'source_id')::uuid,a->>'client_binding',(a->>'platform_client_id')::integer,p_fields) returning * into s;
  insert into app_private.support_delivery_events(request_id,event,actor_id) values(p_request,'persisted',auth.uid());
 end if;
 return jsonb_build_object('request_id',s.request_id,'state',s.state,'ticket_id',s.ticket_id,'status',s.status);
end $$;
create function public.support_pending_submissions() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb:=public.support_ticket_actor_context();begin
 return (select coalesce(jsonb_agg(jsonb_build_object('request_id',request_id,'state',state,'fields',fields,'created_at',created_at,'next_attempt_at',next_attempt_at) order by created_at),'[]') from (select * from app_private.support_submissions where actor_id=auth.uid() and source_id=(a->>'source_id')::uuid and client_binding=a->>'client_binding' and client_id=(a->>'platform_client_id')::integer and state<>'acknowledged' order by created_at limit 20)s);
end $$;
create function public.support_delivery_claim(p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb:=public.support_ticket_actor_context();s app_private.support_submissions;lid uuid:=gen_random_uuid();begin
 select * into strict s from app_private.support_submissions where request_id=p_request and actor_id=auth.uid() for update;
 if s.source_id is distinct from (a->>'source_id')::uuid or s.client_binding is distinct from a->>'client_binding' or s.client_id is distinct from (a->>'platform_client_id')::integer then raise exception 'Submission binding changed' using errcode='42501';end if;
 if s.state in ('acknowledged','review') or s.state='sending' and s.lease_until>now() or s.next_attempt_at>now() then return jsonb_build_object('dispatch',false,'state',s.state);end if;
 if s.attempts>=8 then update app_private.support_submissions set state='review',updated_at=now() where request_id=p_request;return jsonb_build_object('dispatch',false,'state','review');end if;
 update app_private.support_submissions set state='sending',attempts=attempts+1,lease_id=lid,lease_until=now()+interval '90 seconds',updated_at=now() where request_id=p_request;
 insert into app_private.support_delivery_events(request_id,event,actor_id) values(p_request,'dispatched',auth.uid());
 return jsonb_build_object('dispatch',true,'lease_id',lid,'fields',s.fields);
end $$;
create function public.support_delivery_finish(p_request uuid,p_lease uuid,p_outcome text,p_ticket uuid default null,p_status text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare s app_private.support_submissions;begin
 if p_outcome is null or p_outcome not in ('acknowledged','uncertain','review') or p_outcome='acknowledged' and (p_ticket is null or p_status not in ('Open','Resolved') or p_status is null) then raise exception 'Invalid delivery acknowledgment';end if;
 select * into s from app_private.support_submissions where request_id=p_request and lease_id=p_lease and state='sending' for update;
 if not found then return false;end if;
 update app_private.support_submissions set state=case when p_outcome<>'acknowledged' and attempts>=8 then 'review' else p_outcome end,ticket_id=p_ticket,status=p_status,lease_id=null,lease_until=null,next_attempt_at=now()+make_interval(secs=>least(3600,15*power(2,least(attempts,8))::integer)),updated_at=now() where request_id=p_request;
 insert into app_private.support_delivery_events(request_id,event,actor_id)values(p_request,p_outcome,s.actor_id);return true;
end $$;
create function public.support_delivery_review(p_request uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare a jsonb:=public.support_ticket_actor_context();begin
 if length(trim(coalesce(p_reason,''))) not between 10 and 300 then raise exception 'Review reason required';end if;
 update app_private.support_submissions set state='uncertain',attempts=0,next_attempt_at=now(),updated_at=now() where request_id=p_request and actor_id=auth.uid() and source_id=(a->>'source_id')::uuid and client_binding=a->>'client_binding' and state='review';
 if not found then raise exception 'Original review request required' using errcode='42501';end if;
 insert into app_private.support_delivery_events(request_id,event,actor_id,reason) values(p_request,'reviewed_for_same_identity_retry',auth.uid(),trim(p_reason));
end $$;
revoke all on function public.support_submission(uuid,jsonb),public.support_pending_submissions(),public.support_delivery_claim(uuid),public.support_delivery_review(uuid,text) from public,anon,service_role;
grant execute on function public.support_submission(uuid,jsonb),public.support_pending_submissions(),public.support_delivery_claim(uuid),public.support_delivery_review(uuid,text) to authenticated;
revoke all on function public.support_delivery_finish(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.support_delivery_finish(uuid,uuid,text,uuid,text) to service_role;

-- Only structural evidence; never a self-reported release/source fingerprint.
create function public.shop_backend_capabilities() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sc public.shop_config;bc app_private.bridge_config; caps jsonb;begin
 select * into strict sc from public.shop_config where id=1;select * into strict bc from app_private.bridge_config where singleton;
 caps:=jsonb_build_object(
 'usage-outbox',to_regclass('app_private.bridge_events') is not null and to_regclass('app_private.bridge_outbox') is not null and exists(select 1 from pg_trigger where tgrelid='app_private.bridge_events'::regclass and tgname='bridge_events_immutable' and tgenabled<>'D') and not has_function_privilege('authenticated','public.bridge_claim_outbox(integer)','EXECUTE'),
 'billing-projection',to_regprocedure('public.bridge_apply_billing(uuid,bigint,jsonb)') is not null and not has_function_privilege('authenticated','public.bridge_apply_billing(uuid,bigint,jsonb)','EXECUTE'),
 'config-journal',to_regclass('app_private.config_requests') is not null and to_regprocedure('public.bridge_onboarding(text,jsonb)') is not null,
 'support-identity',to_regprocedure('public.support_ticket_actor_context()') is not null and not has_function_privilege('anon','public.support_ticket_actor_context()','EXECUTE'),
 'support-consent',public.support_consent_capability(),
 'support-durable-submissions',to_regclass('app_private.support_submissions') is not null and not has_table_privilege('authenticated','app_private.support_submissions','SELECT') and not has_function_privilege('authenticated','public.support_delivery_finish(uuid,uuid,text,uuid,text)','EXECUTE'),
 'owner-bootstrap',to_regclass('app_private.owner_bootstrap') is not null,
 'private-rls',not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relkind in ('r','p') and not c.relrowsecurity));
 return jsonb_build_object('contract','retrasell-backend-capabilities-v1','client_id',sc.platform_client_id,'source_id',bc.source_id,'client_binding',bc.client_binding,'observed_at',now(),'capabilities',caps,'runtime',public.bridge_runtime_preflight()->'checks','delivery',jsonb_build_object('usage_pending',(select count(*) from app_private.bridge_outbox where state in ('pending','leased')),'support_pending',(select count(*) from app_private.support_submissions where state<>'acknowledged')));
end $$;
revoke all on function public.shop_backend_capabilities() from public,anon,authenticated;
grant execute on function public.shop_backend_capabilities() to service_role;
create function public.owner_backend_capabilities() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform app_private.support_owner();return public.shop_backend_capabilities();end $$;
revoke all on function public.owner_backend_capabilities() from public,anon,service_role;
grant execute on function public.owner_backend_capabilities() to authenticated;
