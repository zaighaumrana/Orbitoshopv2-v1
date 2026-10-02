-- Disposable local test only; no hosted invocation.
begin;
create function pg_temp.assert(ok boolean,msg text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %',msg;end if;end $$;
select public.bridge_onboarding('config-write','{"request_id":"96000000-0000-4000-8000-000000000001","changes":{"suspended":true}}');
select public.bridge_onboarding('config-write','{"request_id":"96000000-0000-4000-8000-000000000002","changes":{"suspended":false}}');
select public.bridge_onboarding('config-write','{"request_id":"96000000-0000-4000-8000-000000000001","changes":{"suspended":true}}');
select pg_temp.assert(not (select suspended from public.shop_config where id=1),'late replay cannot overwrite later activation');
select pg_temp.assert((select count(*) from app_private.config_requests)=2,'one durable record per original identity');
do $$ begin
 begin perform public.bridge_onboarding('config-write','{"request_id":"96000000-0000-4000-8000-000000000001","changes":{"suspended":false}}');raise exception 'changed payload accepted';
 exception when others then if sqlerrm<>'Configuration request identity conflict' then raise;end if;end;
end $$;
select pg_temp.assert(not has_table_privilege('authenticated','app_private.config_requests','SELECT') and not has_function_privilege('authenticated','public.bridge_onboarding(text,jsonb)','EXECUTE'),'journal/service bridge is never browser-accessible');
rollback;
