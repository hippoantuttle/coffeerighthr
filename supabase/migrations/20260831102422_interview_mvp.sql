create table interview_assignments (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null unique references applicants(id) on delete cascade,
  scheduled_at timestamptz,
  duration_minutes int not null default 20 check (duration_minutes between 5 and 180),
  interviewer_names text[] not null default '{}',
  room text,
  mode text not null default 'offline' check (mode in ('offline','online')),
  updated_by_id text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table interview_questions (
  id uuid primary key default gen_random_uuid(),
  recruitment_id uuid not null references recruitments(id) on delete cascade,
  question text not null,
  description text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table interview_notes (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references applicants(id) on delete cascade,
  question_id uuid not null references interview_questions(id) on delete cascade,
  note text not null default '',
  updated_by_id text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(applicant_id, question_id)
);

create table interview_reviews (
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

create table interview_review_scores (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references interview_reviews(id) on delete cascade,
  criterion_id uuid not null references evaluation_criteria(id) on delete restrict,
  score int not null check (score between 1 and 5),
  unique(review_id, criterion_id)
);

create table hermes_artifacts (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null unique references applicants(id) on delete cascade,
  application_summary text not null default '',
  recommended_questions jsonb not null default '[]'::jsonb,
  source_hash text,
  source_version text,
  imported_by_id text,
  imported_by_name text,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index interview_assignments_scheduled_at_idx on interview_assignments(scheduled_at);
create index interview_reviews_applicant_status_idx on interview_reviews(applicant_id, status);

insert into evaluation_criteria (recruitment_id, stage, title, description, weight, sort_order)
select r.id, 'interview', v.title, v.description, v.weight, v.sort_order
from recruitments r
cross join (values
  ('커피 문화 탐구 의지', '실제로 궁금해하고 배우려는 주제와 행동 계획', 30::numeric, 1),
  ('기여 아이디어의 구체성', '본인이 맡을 수 있는 역할과 실행 가능한 제안', 30::numeric, 2),
  ('협업 태도·소통', '듣기, 피드백 수용, 갈등 상황 대응', 25::numeric, 3),
  ('참여 지속 가능성', '학기 중 현실적인 시간·책임 관리 계획', 15::numeric, 4)
) as v(title, description, weight, sort_order)
where not exists (
  select 1 from evaluation_criteria e where e.recruitment_id = r.id and e.stage = 'interview'
);

insert into interview_questions (recruitment_id, question, description, sort_order)
select r.id, v.question, v.description, v.sort_order
from recruitments r
cross join (values
  ('이번 학기에 커피와 관련해 가장 깊게 알아보고 싶은 주제는 무엇이며, 4주 동안 직접 탐구한다면 어떻게 해보겠나요?', '커피 문화 탐구', 1),
  ('커피라이트의 기존 활동 하나를 개선하거나 새 활동을 만든다면 무엇을 제안하고, 본인은 어떤 역할을 맡고 싶나요?', '동아리 기여', 2),
  ('함께 일하는 사람과 방식이나 의견이 달랐던 경험에서 어떻게 조율했나요?', '협업', 3),
  ('바쁜 학기에도 정규 세션과 맡은 역할을 지속하기 위해 일정을 어떻게 관리하겠나요?', '지속성·책임감', 4),
  ('준비 담당자가 갑자기 참여하지 못해 준비가 덜 된 상황이라면 어떻게 행동하겠나요?', '상황형 질문', 5)
) as v(question, description, sort_order)
where not exists (select 1 from interview_questions q where q.recruitment_id = r.id);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'interview_assignments','interview_questions','interview_notes','interview_reviews',
    'interview_review_scores','hermes_artifacts'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end $$;

create index if not exists application_answers_applicant_id_idx on application_answers(applicant_id);
create index if not exists archives_recruitment_id_idx on archives(recruitment_id);
create index if not exists document_review_scores_criterion_id_idx on document_review_scores(criterion_id);
create index if not exists evaluation_criteria_recruitment_id_idx on evaluation_criteria(recruitment_id);
