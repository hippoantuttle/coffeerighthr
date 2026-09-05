do $$
begin
  if exists (
    select 1 from public.document_reviews
    group by applicant_id, trim(reviewer_name)
    having count(*) > 1
  ) or exists (
    select 1 from public.interview_reviews
    group by applicant_id, trim(reviewer_name)
    having count(*) > 1
  ) then
    raise exception '같은 지원자에 동일한 평가자 이름이 중복되어 이름 기반 ID로 전환할 수 없습니다.';
  end if;
end $$;

update public.document_reviews
set reviewer_id = trim(reviewer_name), reviewer_name = trim(reviewer_name);

update public.interview_reviews
set reviewer_id = trim(reviewer_name), reviewer_name = trim(reviewer_name);

alter table public.document_reviews
  add constraint document_reviews_name_identity_check
  check (reviewer_id = reviewer_name and reviewer_name = trim(reviewer_name));

alter table public.interview_reviews
  add constraint interview_reviews_name_identity_check
  check (reviewer_id = reviewer_name and reviewer_name = trim(reviewer_name));
