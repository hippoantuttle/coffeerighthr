import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
export const recruitmentId = "00000000-0000-4000-8000-000000000001";
export const applicantId = "00000000-0000-4000-8000-000000000002";
export const documentCriterion = "00000000-0000-4000-8000-000000000003";

export async function createQaDatabase() {
  const db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  const files = (
    await readdir(new URL("../supabase/migrations/", import.meta.url))
  )
    .filter((x) => x.endsWith(".sql"))
    .sort();
  for (const file of files) {
    // gen_random_uuid is built into PostgreSQL. PGlite does not package pgcrypto.
    const sql = (
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      )
    ).replace("create extension if not exists pgcrypto;", "");
    await db.exec(sql);
    if (file === "0001_initial.sql") {
      await db.query(
        "insert into recruitments(id,name,cohort,final_target_count) values($1,$2,$3,1)",
        [recruitmentId, "로컬 QA 모집", "6기"],
      );
    }
  }
  await db.query(
    "insert into evaluation_criteria(id,recruitment_id,stage,title,description,weight) values($1,$2,'document','지원 동기','구체적인 경험과 계획',100)",
    [documentCriterion, recruitmentId],
  );
  await db.query(
    "insert into applicants(id,recruitment_id,applicant_code,name,email,major,document_status,interview_availability) values($1,$2,'C6-001','테스트 지원자','qa@example.test','QA 전공','interview','9월 7일 14시~18시')",
    [applicantId, recruitmentId],
  );
  await db.query(
    "insert into application_answers(applicant_id,question_key,question_label,answer) values($1,'motivation','지원 동기','커피 문화와 협업을 배우고 싶습니다. 이 내용은 로컬 QA용 가상 지원서입니다.')",
    [applicantId],
  );
  return db;
}
