alter table public.recruitments
  alter column minimum_document_reviews set default 12;

update public.recruitments
set minimum_document_reviews = 12
where minimum_document_reviews = 3;
