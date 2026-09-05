-- Server-only, invoker-rights RPCs. Each call is one transaction.
alter table public.interview_notes add column version integer not null default 1;
alter table public.applicants add column final_version integer not null default 0;

create table public.final_decisions (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  previous_status text not null,
  status text not null,
  reviewer_id text not null,
  reviewer_name text not null,
  created_at timestamptz not null default now()
);
create index final_decisions_applicant_idx on public.final_decisions(applicant_id);
alter table public.final_decisions enable row level security;
revoke all on public.final_decisions from anon, authenticated;
grant all on public.final_decisions to service_role;

create or replace function public.save_review(p_applicant_id uuid, p_stage text, p_reviewer_id text, p_reviewer_name text, p_status text, p_comment text, p_scores jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  a applicants%rowtype; review_table text; score_table text; old_status text; first_submission timestamptz;
  rid uuid; saved jsonb; criterion_count integer; entry record;
begin
  if p_stage not in ('document','interview') or p_status not in ('draft','submitted') or nullif(trim(p_reviewer_id),'') is null or nullif(trim(p_reviewer_name),'') is null or jsonb_typeof(p_scores) is distinct from 'object' then
    raise exception using errcode='22023', message='평가 입력이 올바르지 않습니다.';
  end if;
  select * into a from applicants where id=p_applicant_id for update;
  if not found then raise exception using errcode='22023', message='지원자를 찾을 수 없습니다.'; end if;
  if p_stage='interview' and a.document_status<>'interview' then raise exception using errcode='22023',message='면접 대상자가 아닙니다.'; end if;
  review_table := case when p_stage='document' then 'document_reviews' else 'interview_reviews' end;
  score_table := case when p_stage='document' then 'document_review_scores' else 'interview_review_scores' end;
  execute format('select status,submitted_at from %I where applicant_id=$1 and reviewer_id=$2',review_table) into old_status,first_submission using p_applicant_id,p_reviewer_id;
  if old_status='submitted' then p_status:='submitted'; end if;
  select count(*) into criterion_count from evaluation_criteria where recruitment_id=a.recruitment_id and stage=p_stage and is_active;
  for entry in select key,value from jsonb_each(p_scores) loop
    if not exists(select 1 from evaluation_criteria where id::text=entry.key and recruitment_id=a.recruitment_id and stage=p_stage and is_active)
      or jsonb_typeof(entry.value)<>'number' or (entry.value::text)::numeric not between 1 and 5 or (entry.value::text)::numeric<>trunc((entry.value::text)::numeric) then
      raise exception using errcode='22023', message='해당 전형 항목에 정수 1~5점을 입력해주세요.';
    end if;
  end loop;
  if p_status='submitted' and (criterion_count=0 or (select count(*) from jsonb_object_keys(p_scores))<>criterion_count) then
    raise exception using errcode='22023',message='설정된 모든 평가 항목에 점수를 입력해주세요.';
  end if;
  execute format('insert into %I(applicant_id,reviewer_id,reviewer_name,comment,status,submitted_at) values($1,$2,$3,$4,$5,$6) on conflict(applicant_id,reviewer_id) do update set reviewer_name=excluded.reviewer_name,comment=excluded.comment,status=excluded.status,submitted_at=excluded.submitted_at,updated_at=now() returning id', review_table)
    into rid using p_applicant_id,p_reviewer_id,p_reviewer_name,p_comment,p_status,case when p_status='submitted' then coalesce(first_submission,now()) else null end;
  execute format('delete from %I where review_id=$1',score_table) using rid;
  execute format('insert into %I(review_id,criterion_id,score) select $1,key::uuid,value::integer from jsonb_each_text($2)',score_table) using rid,p_scores;
  execute format('select to_jsonb(r) from %I r where id=$1',review_table) into saved using rid;
  return jsonb_build_object('review',saved,'status',p_status,'scores',p_scores);
end $$;

create or replace function public.save_interview_note(p_applicant_id uuid,p_question_id uuid,p_version integer,p_note text,p_reviewer_id text,p_reviewer_name text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare a applicants%rowtype; n interview_notes%rowtype;
begin
  select * into a from applicants where id=p_applicant_id for update;
  if not found or a.document_status<>'interview' or not exists(select 1 from interview_questions where id=p_question_id and recruitment_id=a.recruitment_id and is_active) then
    raise exception using errcode='22023',message='유효한 면접 대상과 질문이 필요합니다.';
  end if;
  select * into n from interview_notes where applicant_id=p_applicant_id and question_id=p_question_id;
  if coalesce(n.version,0)<>p_version then return jsonb_build_object('conflict',true,'note',to_jsonb(n)); end if;
  insert into interview_notes(applicant_id,question_id,note,updated_by_id,updated_by_name,version)
    values(p_applicant_id,p_question_id,p_note,p_reviewer_id,p_reviewer_name,1)
    on conflict(applicant_id,question_id) do update set note=excluded.note,updated_by_id=excluded.updated_by_id,updated_by_name=excluded.updated_by_name,updated_at=now(),version=interview_notes.version+1
    returning * into n;
  return jsonb_build_object('note',to_jsonb(n),'conflict',false);
end $$;

create or replace function public.save_final_decision(p_applicant_id uuid,p_version integer,p_status text,p_reviewer_id text,p_reviewer_name text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare a applicants%rowtype;
begin
  if p_status not in ('pending','accepted','waitlisted','rejected','hold') then raise exception using errcode='22023',message='올바른 최종 상태를 선택해주세요.'; end if;
  select * into a from applicants where id=p_applicant_id for update;
  if not found or a.document_status<>'interview' then raise exception using errcode='22023',message='면접 대상자가 아닙니다.'; end if;
  if a.final_version<>p_version then raise exception using errcode='40001',message='최종 상태가 변경되었습니다.'; end if;
  if a.final_status<>p_status then
    insert into final_decisions(applicant_id,previous_status,status,reviewer_id,reviewer_name) values(a.id,a.final_status,p_status,p_reviewer_id,p_reviewer_name);
    update applicants set final_status=p_status,final_version=final_version+1,updated_at=now() where id=a.id returning * into a;
  end if;
  return jsonb_build_object('id',a.id,'final_status',a.final_status,'final_version',a.final_version);
end $$;

create or replace function public.commit_applicant_import(p_recruitment_id uuid,p_snapshot jsonb,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare rec recruitments%rowtype; snapshot jsonb; row jsonb; a applicants%rowtype; email_id uuid; phone_ids uuid[];
  sequence integer; prefix text; new_count integer:=0; changed_count integer:=0; unchanged_count integer:=0;
begin
  select * into rec from recruitments where id=p_recruitment_id for update;
  if not found then raise exception using errcode='22023',message='모집 정보를 찾을 수 없습니다.'; end if;
  select coalesce(jsonb_object_agg(id::text,source_hash),'{}'::jsonb) into snapshot from applicants where recruitment_id=p_recruitment_id;
  if snapshot is distinct from p_snapshot then raise exception using errcode='40001',message='지원서가 변경되었습니다. 다시 비교해주세요.'; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception using errcode='22023',message='저장할 행이 없습니다.'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r group by lower(r->>'email') having count(*)>1)
    or exists(select 1 from jsonb_array_elements(p_rows) r where nullif(r->>'phone','') is not null group by r->>'phone' having count(*)>1) then
    raise exception using errcode='22023',message='파일 내부에 중복된 이메일 또는 전화번호가 있습니다.';
  end if;
  select coalesce(max(substring(applicant_code from '-([0-9]+)$')::integer),0)+1 into sequence from applicants where recruitment_id=p_recruitment_id;
  prefix:='C'||coalesce(substring(rec.cohort from '[0-9]+'),regexp_replace(rec.cohort,'\s','','g'))||'-';
  for row in select value from jsonb_array_elements(p_rows) loop
    if nullif(trim(row->>'name'),'') is null or coalesce(row->>'email','') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception using errcode='22023',message='이름과 이메일을 확인해주세요.'; end if;
    email_id:=null; phone_ids:=null;
    select id into email_id from applicants where recruitment_id=p_recruitment_id and lower(email)=lower(row->>'email');
    select array_agg(id) into phone_ids from applicants where recruitment_id=p_recruitment_id and nullif(row->>'phone','') is not null and regexp_replace(coalesce(phone,''),'\D','','g')=row->>'phone';
    if coalesce(cardinality(phone_ids),0)>1 or (email_id is not null and phone_ids[1] is not null and email_id<>phone_ids[1]) then raise exception using errcode='22023',message='이메일과 전화번호가 다른 지원자와 일치합니다.'; end if;
    a:=null;
    select * into a from applicants where id=coalesce(email_id,phone_ids[1]) for update;
    if a.id is not null and a.source_hash=row->>'source_hash' then unchanged_count:=unchanged_count+1; continue; end if;
    if a.id is null then
      insert into applicants(recruitment_id,applicant_code,name,email) values(rec.id,prefix||lpad(sequence::text,greatest(3,length(sequence::text)),'0'),row->>'name',row->>'email') returning * into a;
      sequence:=sequence+1; new_count:=new_count+1;
    else changed_count:=changed_count+1;
    end if;
    update applicants set name=row->>'name',email=row->>'email',phone=nullif(row->>'phone',''),major=nullif(row->>'major',''),student_number=nullif(row->>'student_number',''),grade=nullif(row->>'grade',''),gender=nullif(row->>'gender',''),birth_date=(row->>'birth_date')::date,
      interests=coalesce(row->'interests','[]'),interview_availability=nullif(row->>'interview_availability',''),source_submitted_at=(row->>'source_submitted_at')::timestamptz,source_hash=row->>'source_hash',consent_text=row->>'consent_text',application_source=row->>'application_source',session_confirmation=row->>'session_confirmation',ot_mt_reason=row->>'ot_mt_reason',source_data=row->'source_data',extra_fields=row->'extra_fields',updated_at=now() where id=a.id;
    delete from application_answers where applicant_id=a.id;
    insert into application_answers(applicant_id,question_key,question_label,answer,sort_order)
      select a.id,x->>'key',x->>'question',x->>'answer',(ordinality-1)::integer from jsonb_array_elements(row->'answers') with ordinality t(x,ordinality);
  end loop;
  return jsonb_build_object('new',new_count,'changed',changed_count,'existing',unchanged_count);
end $$;

revoke all on function public.save_review(uuid,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.save_interview_note(uuid,uuid,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.save_final_decision(uuid,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.commit_applicant_import(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_review(uuid,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.save_interview_note(uuid,uuid,integer,text,text,text) to service_role;
grant execute on function public.save_final_decision(uuid,integer,text,text,text) to service_role;
grant execute on function public.commit_applicant_import(uuid,jsonb,jsonb) to service_role;
