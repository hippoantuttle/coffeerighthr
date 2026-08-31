alter table applicants add column if not exists consent_text text;
alter table applicants add column if not exists application_source text;
alter table applicants add column if not exists session_confirmation text;
alter table applicants add column if not exists ot_mt_reason text;
alter table applicants add column if not exists source_data jsonb not null default '{}'::jsonb;
alter table applicants add column if not exists extra_fields jsonb not null default '{}'::jsonb;
create index if not exists applicants_phone_idx on applicants(recruitment_id, phone);
