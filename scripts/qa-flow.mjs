import assert from "node:assert/strict";
import JSZip from "jszip";
const base = "http://127.0.0.1:3000",
  recruitmentId = "00000000-0000-4000-8000-000000000001";
const identity = { reviewerId: "integration-qa", reviewerName: "통합 QA" };
async function api(path, body, method = "POST") {
  const r = await fetch(
    base + path,
    body
      ? {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const d = await r.json();
  assert.ok(r.ok, `${path}: ${r.status} ${JSON.stringify(d)}`);
  return d;
}
const rows = Array.from({ length: 10 }, (_, i) => ({
  성명: `가상 지원자 ${i + 1}`,
  이메일: `flow${i + 1}@example.test`,
  전화번호: `0101111${String(i).padStart(4, "0")}`,
  "지원 동기": `로컬 QA 답변 ${i + 1}`,
}));
const mappings = [
  ["성명", "name"],
  ["이메일", "email"],
  ["전화번호", "phone"],
  ["지원 동기", "answerMotivation"],
].map(([header, target]) => ({ header, target, confidence: "high" }));
const input = { recruitmentId, rows, mappings };
let preview = await api("/api/import/applicants/preview", input);
assert.equal(preview.summary.invalid, 0);
await api("/api/import/applicants/commit", {
  ...input,
  snapshot: preview.snapshot,
});
preview = await api("/api/import/applicants/preview", input);
assert.equal(preview.summary.existing, 10);
rows[0]["지원 동기"] = "변경된 답변";
preview = await api("/api/import/applicants/preview", input);
assert.equal(preview.summary.changed, 1);
await api("/api/import/applicants/commit", {
  ...input,
  snapshot: preview.snapshot,
});
const duplicate = await api("/api/import/applicants/preview", {
  ...input,
  rows: [rows[0], rows[0]],
});
assert.equal(duplicate.summary.invalid, 2);
let summary = await api(
  `/api/applicants/summary?recruitmentId=${recruitmentId}&reviewerId=${identity.reviewerId}`,
);
const applicant = summary.rows.find((r) => r.name === "가상 지원자 1");
assert.ok(applicant);
const scores = { "00000000-0000-4000-8000-000000000003": 4 };
await api(`/api/applicants/${applicant.id}/review`, {
  ...identity,
  scores,
  comment: "통합 테스트 서류 평가",
  status: "submitted",
});
summary = await api(
  `/api/applicants/summary?recruitmentId=${recruitmentId}&reviewerId=${identity.reviewerId}`,
);
assert.equal(
  summary.rows.find((r) => r.id === applicant.id).document_average,
  4,
);
const blind = await api(
  `/api/applicants/${applicant.id}/review?reviewerId=unsubmitted-qa`,
);
assert.equal(blind.aggregate, null);
await api(
  `/api/applicants/${applicant.id}/status`,
  { status: "interview" },
  "PATCH",
);
await api(
  `/api/interviews/${applicant.id}`,
  {
    ...identity,
    action: "schedule",
    scheduledAt: "2026-09-07T05:00:00Z",
    durationMinutes: 20,
    interviewerNames: ["QA A", "QA B"],
    room: "로컬 QA실",
    mode: "offline",
  },
  "PATCH",
);
const exported = await api(
  `/api/export/hermes?recruitmentId=${recruitmentId}&format=json`,
);
assert.ok(exported.some((r) => r.applicant_code === applicant.applicant_code));
const hermes = {
  ...identity,
  recruitmentId,
  rows: [
    {
      applicant_code: applicant.applicant_code,
      application_summary: "가상 지원서 요약",
      recommended_questions: ["이 활동의 실행 계획은?"],
    },
  ],
};
assert.equal(
  (await api("/api/import/hermes", { ...hermes, action: "preview" })).canCommit,
  true,
);
await api("/api/import/hermes", { ...hermes, action: "commit" });
let detail = await api(
  `/api/interviews/${applicant.id}?reviewerId=${identity.reviewerId}`,
);
assert.equal(detail.artifact.application_summary, "가상 지원서 요약");
const q = detail.questions[0];
await api(
  `/api/interviews/${applicant.id}`,
  {
    ...identity,
    action: "note",
    questionId: q.id,
    version: 0,
    note: "공유 메모",
  },
  "PATCH",
);
await api(
  `/api/interviews/${applicant.id}`,
  {
    ...identity,
    action: "review",
    status: "submitted",
    scores: Object.fromEntries(detail.criteria.map((c) => [c.id, 5])),
    comment: "면접 QA",
  },
  "PATCH",
);
detail = await api(
  `/api/interviews/${applicant.id}?reviewerId=${identity.reviewerId}`,
);
assert.equal(detail.aggregate.average, 5);
await api(
  `/api/applicants/${applicant.id}/final`,
  { ...identity, version: 0, status: "accepted" },
  "PATCH",
);
const interviews = await api(
  `/api/interviews/summary?recruitmentId=${recruitmentId}`,
);
assert.equal(
  interviews.rows.find((r) => r.id === applicant.id).final_status,
  "accepted",
);
for (const type of ["document-final", "interview_final", "full_final"]) {
  const response = await fetch(base + "/api/archive/" + type, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...identity,
      recruitmentId,
      includePersonalData: true,
    }),
  });
  assert.equal(response.status, 200);
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  assert.ok(zip.file("archive_metadata.json"));
  if (type === "full_final") {
    assert.ok(zip.file("application_source.csv"));
    assert.match(
      await zip.file("final_decisions.csv").async("string"),
      /accepted/,
    );
    assert.match(
      await zip.file("document_review_scores.csv").async("string"),
      /통합 QA/,
    );
  }
}
console.log(
  "PASS: 10-row import → duplicate/changed preview → document review/blind policy → schedule → Hermes round-trip → interview review → final decision → 3 ZIP archives",
);
