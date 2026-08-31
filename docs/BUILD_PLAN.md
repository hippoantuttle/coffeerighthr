# COFFEERIGHT Recruiting MVP Build Plan

## Fixed product data flow
Google Form = 접수 → 웹앱 = 평가 진행 → Google Drive = 장기 기록 보존

## Build order
1. Foundation + reviewer identity ✅
2. Google Form CSV import + preview + deduplication 🚧
3. Applicant dashboard/detail
4. Document review draft/submit + blind review
5. Document final archive export
6. Interview workflow + schedule + shared notes + reviews
7. Hermes export/import
8. Interview final archive export
9. Final selection + full final archive
10. Verification, Vercel deploy, data deletion rehearsal

## Step 2 implemented
- CSV reader and editable column mapping UI
- COFFEERIGHT form-concept header inference
- unknown columns preserved in `source_data` / `extra_fields`
- email + phone normalization
- row validation
- source fingerprint
- DB-side preview classification: new / existing / changed / invalid
- import commit route
- stable applicant codes (`C6-001` style) that are not reused during normal import
- changed source rows update applicant data and replace application answers without touching reviews

## Next dependency
1. Validate exact automatic mapping against the uploaded Google Form CSV header row.
2. Create the Supabase project and apply migrations.
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Vercel/server environment (never expose the service-role key to browser code or public chat).
4. Run a 10-row dummy import / duplicate re-import / changed-row rehearsal.
