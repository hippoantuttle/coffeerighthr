-- This app accesses Supabase only from Next.js server routes with the service role.
-- Applying this migration intentionally blocks direct anon/authenticated Data API access.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'recruitments','applicants','application_answers','evaluation_criteria',
    'document_reviews','document_review_scores','archives'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end $$;
