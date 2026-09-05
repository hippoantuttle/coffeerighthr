create extension if not exists pgcrypto;

create table recruitments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cohort text not null,
  current_stage text not null default 'document',
  document_target_count int,
  final_target_count int,
  minimum_document_reviews int not null default 12,
  minimum_interview_reviews int not null default 2,
  created_at timestamptz not null default now()
);

create table applicants (
  id uuid primary key default gen_random_uuid(),
  recruitment_id uuid not null references recruitments(id) on delete cascade,
  applicant_code text not null,
  name text not null,
  email text not null,
  phone text,
  major text,
  student_number text,
  grade text,
  gender text,
  birth_date date,
  interests jsonb not null default '[]'::jsonb,
  interview_availability text,
  document_status text not null default 'pending',
  final_status text not null default 'pending',
  source_submitted_at timestamptz,
  source_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(recruitment_id, applicant_code),
  unique(recruitment_id, email)
);

create table application_answers (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references applicants(id) on delete cascade,
  question_key text not null,
  question_label text not null,
  answer text not null default '',
  answer_hash text,
  sort_order int not null default 0
);

create table evaluation_criteria (
  id uuid primary key default gen_random_uuid(),
  recruitment_id uuid not null references recruitments(id) on delete cascade,
  stage text not null check (stage in ('document','interview')),
  title text not null,
  description text,
  weight numeric(5,2) not null,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table document_reviews (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references applicants(id) on delete cascade,
  reviewer_id text not null,
  reviewer_name text not null,
  comment text,
  status text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(applicant_id, reviewer_id)
);

create table document_review_scores (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references document_reviews(id) on delete cascade,
  criterion_id uuid not null references evaluation_criteria(id) on delete restrict,
  score int not null check (score between 1 and 5),
  unique(review_id, criterion_id)
);

create table archives (
  id uuid primary key default gen_random_uuid(),
  recruitment_id uuid not null references recruitments(id) on delete cascade,
  archive_type text not null check (archive_type in ('document_final','interview_final','full_final')),
  created_by_id text,
  created_by_name text,
  contains_personal_data boolean not null default false,
  schema_version text not null default '1.0',
  applicant_count int not null default 0,
  manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
