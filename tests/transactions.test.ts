import { beforeAll, afterAll, describe, it, expect } from "vitest";
import {
  createQaDatabase,
  recruitmentId,
  applicantId,
  documentCriterion,
} from "../scripts/qa-database.mjs";
import type { PGlite } from "@electric-sql/pglite";
let db: PGlite;
beforeAll(async () => {
  db = await createQaDatabase();
});
afterAll(async () => {
  await db?.close();
});
async function review(scores: Record<string, number>, status = "submitted") {
  const r = await db.query<{ result: { status: string } }>(
    "select save_review($1,'document','QA 평가자','QA 평가자',$2,'코멘트',$3::jsonb) result",
    [applicantId, status, JSON.stringify(scores)],
  );
  return r.rows[0].result;
}
describe("real PostgreSQL workflow transactions", () => {
  it("rejects incomplete submission and keeps a submitted review submitted", async () => {
    await expect(review({})).rejects.toThrow();
    expect((await review({ [documentCriterion]: 4 })).status).toBe("submitted");
    expect((await review({ [documentCriterion]: 5 }, "draft")).status).toBe(
      "submitted",
    );
  });
  it("rolls back review and score deletion if score insertion fails", async () => {
    await db.exec(
      "create function qa_fail_score() returns trigger language plpgsql as $$ begin raise exception 'QA forced failure'; end $$; create trigger qa_fail before insert on document_review_scores for each row execute function qa_fail_score();",
    );
    await expect(review({ [documentCriterion]: 2 })).rejects.toThrow(
      "QA forced failure",
    );
    expect(
      (
        await db.query<{ score: number }>(
          "select score from document_review_scores",
        )
      ).rows[0].score,
    ).toBe(5);
    await db.exec(
      "drop trigger qa_fail on document_review_scores; drop function qa_fail_score();",
    );
  });
  it("rejects foreign criteria and scores outside the integer range", async () => {
    const foreign = (
      await db.query<{ id: string }>(
        "select id from evaluation_criteria where stage='interview' limit 1",
      )
    ).rows[0].id;
    await expect(review({ [foreign]: 5 })).rejects.toThrow();
    await expect(review({ [documentCriterion]: 2.5 })).rejects.toThrow();
  });
  it("detects note conflicts without overwriting the latest note", async () => {
    const q = (
      await db.query<{ id: string }>(
        "select id from interview_questions limit 1",
      )
    ).rows[0].id;
    const save = async (version: number, note: string) =>
      (
        await db.query<{
          r: { conflict: boolean; note: { note: string; version: number } };
        }>("select save_interview_note($1,$2,$3,$4,'qa','QA') r", [
          applicantId,
          q,
          version,
          note,
        ])
      ).rows[0].r;
    expect((await save(0, "first")).note.version).toBe(1);
    expect((await save(0, "stale")).conflict).toBe(true);
    expect((await save(1, "merged")).note.note).toBe("merged");
  });
  it("records final decisions and rejects a stale version", async () => {
    await db.query("select save_final_decision($1,0,'accepted','qa','QA')", [
      applicantId,
    ]);
    await expect(
      db.query("select save_final_decision($1,0,'rejected','qa','QA')", [
        applicantId,
      ]),
    ).rejects.toThrow();
    expect(
      (await db.query<{ status: string }>("select status from final_decisions"))
        .rows,
    ).toEqual([{ status: "accepted" }]);
  });
  it("imports atomically, skips identical rows and retains codes/reviews on change", async () => {
    const snapshot = async () =>
      (
        await db.query<{ s: unknown }>(
          "select coalesce(jsonb_object_agg(id::text,source_hash),'{}') s from applicants where recruitment_id=$1",
          [recruitmentId],
        )
      ).rows[0].s;
    const row = {
      name: "CSV QA",
      email: "csv@example.test",
      phone: "01000000000",
      source_hash: "one",
      answers: [{ key: "motivation", question: "동기", answer: "첫 답변" }],
      source_data: { name: "CSV QA" },
      extra_fields: {},
    };
    const commit = async (rows: unknown[], s: unknown) =>
      (
        await db.query<{
          r: { new: number; changed: number; existing: number };
        }>("select commit_applicant_import($1,$2::jsonb,$3::jsonb) r", [
          recruitmentId,
          JSON.stringify(s),
          JSON.stringify(rows),
        ])
      ).rows[0].r;
    const first = await snapshot();
    expect((await commit([row], first)).new).toBe(1);
    await expect(commit([row], first)).rejects.toThrow();
    expect((await commit([row], await snapshot())).existing).toBe(1);
    expect(
      (await commit([{ ...row, source_hash: "two" }], await snapshot()))
        .changed,
    ).toBe(1);
    expect(
      (
        await db.query<{ applicant_code: string }>(
          "select applicant_code from applicants where email='csv@example.test'",
        )
      ).rows[0].applicant_code,
    ).toBe("C6-002");
    const before = await snapshot();
    await expect(
      commit(
        [
          { ...row, email: "new@example.test", phone: "" },
          { ...row, email: "invalid", phone: "" },
        ],
        before,
      ),
    ).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    expect(
      (
        await db.query<{ score: number }>(
          "select score from document_review_scores",
        )
      ).rows[0].score,
    ).toBe(5);
  });
  it("does not expose write RPCs to anonymous roles", async () => {
    const r = await db.query<{ allowed: boolean }>(
      "select has_function_privilege('anon','save_review(uuid,text,text,text,text,text,jsonb)','execute') allowed",
    );
    expect(r.rows[0].allowed).toBe(false);
  });
});
