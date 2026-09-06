create or replace function public.save_review(
  p_applicant_id uuid,
  p_stage text,
  p_reviewer_id text,
  p_reviewer_name text,
  p_status text,
  p_comment text,
  p_scores jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  a applicants%rowtype;
  review_table text;
  score_table text;
  old_status text;
  first_submission timestamptz;
  rid uuid;
  saved jsonb;
  criterion_count integer;
  reviewer_count integer;
  entry record;
begin
  if p_stage not in ('document', 'interview')
    or p_status not in ('draft', 'submitted')
    or nullif(trim(p_reviewer_id), '') is null
    or nullif(trim(p_reviewer_name), '') is null
    or jsonb_typeof(p_scores) is distinct from 'object'
  then
    raise exception using errcode = '22023', message = '평가 입력이 올바르지 않습니다.';
  end if;

  select * into a
  from applicants
  where id = p_applicant_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = '지원자를 찾을 수 없습니다.';
  end if;
  if p_stage = 'interview' and a.document_status <> 'interview' then
    raise exception using errcode = '22023', message = '면접 대상자가 아닙니다.';
  end if;

  review_table := case when p_stage = 'document' then 'document_reviews' else 'interview_reviews' end;
  score_table := case when p_stage = 'document' then 'document_review_scores' else 'interview_review_scores' end;

  if p_stage = 'interview'
    and not exists (
      select 1
      from interview_reviews
      where applicant_id = p_applicant_id
        and reviewer_id = p_reviewer_id
    )
  then
    select count(*) into reviewer_count
    from interview_reviews
    where applicant_id = p_applicant_id;

    if reviewer_count >= 3 then
      raise exception using
        errcode = '22023',
        message = '면접 평가는 지원자별 최대 3명까지 참여할 수 있습니다.';
    end if;
  end if;

  execute format(
    'select status,submitted_at from %I where applicant_id=$1 and reviewer_id=$2',
    review_table
  )
  into old_status, first_submission
  using p_applicant_id, p_reviewer_id;

  if old_status = 'submitted' then
    p_status := 'submitted';
  end if;

  select count(*) into criterion_count
  from evaluation_criteria
  where recruitment_id = a.recruitment_id
    and stage = p_stage
    and is_active;

  for entry in select key, value from jsonb_each(p_scores) loop
    if not exists (
      select 1
      from evaluation_criteria
      where id::text = entry.key
        and recruitment_id = a.recruitment_id
        and stage = p_stage
        and is_active
    )
      or jsonb_typeof(entry.value) <> 'number'
      or (entry.value::text)::numeric not between 1 and 5
      or (entry.value::text)::numeric <> trunc((entry.value::text)::numeric)
    then
      raise exception using errcode = '22023', message = '해당 전형 항목에 정수 1~5점을 입력해주세요.';
    end if;
  end loop;

  if p_status = 'submitted'
    and (
      criterion_count = 0
      or (select count(*) from jsonb_object_keys(p_scores)) <> criterion_count
    )
  then
    raise exception using errcode = '22023', message = '설정된 모든 평가 항목에 점수를 입력해주세요.';
  end if;

  execute format(
    'insert into %I(applicant_id,reviewer_id,reviewer_name,comment,status,submitted_at) values($1,$2,$3,$4,$5,$6) on conflict(applicant_id,reviewer_id) do update set reviewer_name=excluded.reviewer_name,comment=excluded.comment,status=excluded.status,submitted_at=excluded.submitted_at,updated_at=now() returning id',
    review_table
  )
  into rid
  using
    p_applicant_id,
    p_reviewer_id,
    p_reviewer_name,
    p_comment,
    p_status,
    case when p_status = 'submitted' then coalesce(first_submission, now()) else null end;

  execute format('delete from %I where review_id=$1', score_table) using rid;
  execute format(
    'insert into %I(review_id,criterion_id,score) select $1,key::uuid,value::integer from jsonb_each_text($2)',
    score_table
  ) using rid, p_scores;
  execute format('select to_jsonb(r) from %I r where id=$1', review_table) into saved using rid;

  return jsonb_build_object('review', saved, 'status', p_status, 'scores', p_scores);
end;
$$;
