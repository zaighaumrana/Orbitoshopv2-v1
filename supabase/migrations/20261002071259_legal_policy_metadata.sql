begin;
-- Confirmed document metadata only. Professional legal/provider review is pending.
-- Never rewrite the already-applied legal_acceptance migration or publish here.
update app_private.legal_policy
set required_revision = '2026-10-03.1',
    terms_version = '1.0',
    privacy_version = '1.0',
    dpa_version = '1.0',
    published = false
where singleton;
commit;
