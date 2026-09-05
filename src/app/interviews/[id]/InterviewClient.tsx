"use client";
import { useEffect, useRef, useState } from "react";
import { HttpError, jsonRequest, requestJson } from "@/lib/http";
import { reviewerSetupUrl } from "@/lib/reviewer/navigation";
import { useUnsavedChanges } from "@/lib/hooks/useUnsavedChanges";

type Criterion = {
  id: string;
  title: string;
  description: string | null;
  weight: number;
};
type Note = {
  question_id: string;
  note: string;
  version: number;
  updated_by_name: string | null;
  updated_at: string;
};
type Review = { status: "draft" | "submitted"; comment: string | null };
type Data = {
  applicant: {
    applicant_code: string;
    name: string;
    major: string | null;
    grade: string | null;
    interview_availability: string | null;
  };
  answers: { question_label: string; answer: string }[];
  criteria: Criterion[];
  questions: { id: string; question: string; description: string | null }[];
  notes: Note[];
  artifact: {
    application_summary: string;
    recommended_questions: string[];
  } | null;
  aggregate: {
    average: number;
    min: number;
    max: number;
    count: number;
    highVariance: boolean;
  } | null;
  reviews: { id: string; reviewer_name: string; comment: string | null }[];
  myReview: Review | null;
  myScores: { criterion_id: string; score: number }[];
};
type Form = { scores: Record<string, number>; comment: string };
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export default function InterviewClient({
  applicantId,
}: {
  applicantId: string;
}) {
  return <InterviewForm key={applicantId} applicantId={applicantId} />;
}

function InterviewForm({ applicantId }: { applicantId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [identity, setIdentity] = useState({
    reviewerId: "",
    reviewerName: "",
  });
  const [form, setForm] = useState<Form>({ scores: {}, comment: "" });
  const [savedForm, setSavedForm] = useState<Form>({ scores: {}, comment: "" });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savedNotes, setSavedNotes] = useState<Record<string, Note>>({});
  const [conflicts, setConflicts] = useState<Record<string, Note>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const locks = useRef(new Set<string>());
  const mounted = useRef(false);
  const dirty =
    !same(form, savedForm) ||
    Object.entries(notes).some(
      ([id, value]) => value !== (savedNotes[id]?.note ?? ""),
    );
  useUnsavedChanges(dirty);

  useEffect(() => {
    mounted.current = true;
    const reviewerId = localStorage.getItem("coffeeright.reviewerId"),
      reviewerName = localStorage.getItem("coffeeright.reviewerName");
    if (!reviewerId || !reviewerName) {
      location.href = reviewerSetupUrl();
      return;
    }
    setIdentity({ reviewerId, reviewerName });
    let current = true;
    requestJson<Data>(
      `/api/interviews/${applicantId}?reviewerId=${encodeURIComponent(reviewerId)}`,
    )
      .then((body) => {
        if (!current) return;
        setData(body);
        const initial = {
          scores: Object.fromEntries(
            body.myScores.map((x) => [x.criterion_id, x.score]),
          ),
          comment: body.myReview?.comment ?? "",
        };
        setForm(initial);
        setSavedForm(initial);
        setSavedNotes(
          Object.fromEntries(body.notes.map((n) => [n.question_id, n])),
        );
        setNotes(
          Object.fromEntries(body.notes.map((n) => [n.question_id, n.note])),
        );
      })
      .catch((error) => {
        if (current) setMessages({ page: error.message });
      });
    return () => {
      current = false;
      mounted.current = false;
    };
  }, [applicantId]);

  async function save(key: string, task: () => Promise<void>) {
    if (locks.current.has(key)) return;
    locks.current.add(key);
    setBusy((v) => ({ ...v, [key]: true }));
    setMessages((v) => ({ ...v, [key]: "저장 중…" }));
    try {
      await task();
    } catch (error) {
      if (mounted.current)
        setMessages((v) => ({
          ...v,
          [key]:
            error instanceof Error
              ? error.message
              : "저장 실패. 다시 시도해주세요.",
        }));
    } finally {
      locks.current.delete(key);
      if (mounted.current) setBusy((v) => ({ ...v, [key]: false }));
    }
  }

  function saveNote(questionId: string) {
    const sent = notes[questionId] ?? "";
    void save(questionId, async () => {
      try {
        const body = await requestJson<{ note: Note }>(
          `/api/interviews/${applicantId}`,
          jsonRequest("PATCH", {
            action: "note",
            questionId,
            note: sent,
            version: savedNotes[questionId]?.version ?? 0,
            ...identity,
          }),
        );
        if (!mounted.current) return;
        setSavedNotes((v) => ({ ...v, [questionId]: body.note }));
        setMessages((v) => ({
          ...v,
          [questionId]: "전송한 메모를 저장했습니다.",
        }));
      } catch (error) {
        if (
          mounted.current &&
          error instanceof HttpError &&
          error.status === 409 &&
          error.body.note
        )
          setConflicts((v) => ({
            ...v,
            [questionId]: error.body.note as Note,
          }));
        throw error;
      }
    });
  }

  function saveReview(status: "draft" | "submitted") {
    if (!data) return;
    if (
      (status === "submitted" || data.myReview?.status === "submitted") &&
      (!data.criteria.length ||
        !data.criteria.every(
          (c) =>
            Number.isInteger(form.scores[c.id]) &&
            form.scores[c.id] >= 1 &&
            form.scores[c.id] <= 5,
        ))
    ) {
      setMessages((v) => ({
        ...v,
        review: "설정된 모든 평가 항목에 점수를 입력해주세요.",
      }));
      return;
    }
    const sent = { scores: { ...form.scores }, comment: form.comment };
    void save("review", async () => {
      const body = await requestJson<{
        review: Review;
        scores: Record<string, number>;
      }>(
        `/api/interviews/${applicantId}`,
        jsonRequest("PATCH", {
          action: "review",
          status,
          ...sent,
          ...identity,
        }),
      );
      if (!mounted.current) return;
      setSavedForm(sent);
      setData((v) => (v ? { ...v, myReview: body.review } : v));
      setMessages((v) => ({
        ...v,
        review:
          body.review.status === "submitted"
            ? "전송한 평가를 제출했습니다."
            : "전송한 평가를 임시 저장했습니다.",
      }));
      try {
        const latest = await requestJson<Data>(
          `/api/interviews/${applicantId}?reviewerId=${encodeURIComponent(identity.reviewerId)}`,
        );
        if (mounted.current)
          setData((v) =>
            v
              ? { ...v, aggregate: latest.aggregate, reviews: latest.reviews }
              : v,
          );
      } catch {
        if (mounted.current)
          setMessages((v) => ({
            ...v,
            review:
              "평가는 저장되었습니다. 다른 평가 현황 갱신은 실패했습니다.",
          }));
      }
    });
  }

  if (!data)
    return (
      <main>
        <a href="/interviews" className="quiet-link">
          ← 면접 대상 목록
        </a>
        <p role="status" className="empty">
          {messages.page ?? "면접 정보를 불러오는 중입니다."}
        </p>
        {messages.page && (
          <button onClick={() => location.reload()}>다시 시도</button>
        )}
      </main>
    );
  return (
    <main>
      <div className="review-top">
        <a href="/interviews" className="quiet-link">
          ← 면접 대상 목록
        </a>
        <span>{data.applicant.applicant_code}</span>
      </div>
      <div className="review-layout">
        <section>
          <h1>{data.applicant.name}</h1>
          <p className="lead">
            {data.applicant.major ?? "전공 미입력"} ·{" "}
            {data.applicant.grade ?? "학년 미입력"}
          </p>
          <p className="muted">
            면접 가능 시간 · {data.applicant.interview_availability ?? "미입력"}
          </p>
          {data.artifact ? (
            <section className="hermes-card">
              <h2>Hermes 지원서 요약</h2>
              <p className="prewrap">{data.artifact.application_summary}</p>
              <strong>맞춤 질문</strong>
              <ol>
                {data.artifact.recommended_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            </section>
          ) : (
            <section className="card">
              Hermes 결과가 아직 없습니다.{" "}
              <a className="quiet-link" href="/hermes">
                결과 가져오기
              </a>
            </section>
          )}
          <details className="details">
            <summary>원문 지원서 보기</summary>
            {data.answers.map((a, i) => (
              <article className="answer" key={i}>
                <p className="question">{a.question_label}</p>
                <p>{a.answer}</p>
              </article>
            ))}
          </details>
          <h2>공통 질문 · 공유 메모</h2>
          {data.questions.map((q) => (
            <article className="question-note" key={q.id}>
              <label htmlFor={`note-${q.id}`}>
                <strong>{q.question}</strong>
              </label>
              {q.description && <p className="hint">{q.description}</p>}
              <textarea
                id={`note-${q.id}`}
                className="textarea"
                value={notes[q.id] ?? ""}
                onChange={(e) =>
                  setNotes((v) => ({ ...v, [q.id]: e.target.value }))
                }
                placeholder="면접관 모두가 함께 보는 메모"
              />
              {conflicts[q.id] && (
                <div className="conflict-box">
                  <strong>다른 면접관이 저장한 최신 메모</strong>
                  <p className="prewrap">
                    {conflicts[q.id].note || "(빈 메모)"}
                  </p>
                  <p className="hint">
                    위 입력란의 내 내용은 유지됩니다. 필요한 내용을 합친 뒤 다시
                    저장하세요.
                  </p>
                  <button
                    className="secondary"
                    onClick={() => {
                      setSavedNotes((v) => ({ ...v, [q.id]: conflicts[q.id] }));
                      setConflicts((v) => {
                        const copy = { ...v };
                        delete copy[q.id];
                        return copy;
                      });
                    }}
                  >
                    최신 내용 확인 완료 · 내 입력 유지
                  </button>
                </div>
              )}
              <button
                className="secondary"
                disabled={busy[q.id] || !!conflicts[q.id]}
                onClick={() => saveNote(q.id)}
              >
                {busy[q.id] ? "저장 중…" : "메모 저장"}
              </button>
              <span className="hint">
                {" "}
                {(notes[q.id] ?? "") !== (savedNotes[q.id]?.note ?? "")
                  ? "저장하지 않은 변경 있음"
                  : "저장된 내용"}
                {savedNotes[q.id]?.updated_by_name &&
                  ` · 최근 수정: ${savedNotes[q.id].updated_by_name}`}
              </span>
              <p role="status" className="save-message">
                {messages[q.id]}
              </p>
            </article>
          ))}
          {data.aggregate && (
            <section className="card">
              <h2>면접 평가 현황</h2>
              <strong>평균 {data.aggregate.average.toFixed(2)}</strong>
              <p>
                제출 {data.aggregate.count}명 · 범위{" "}
                {data.aggregate.min.toFixed(2)}–{data.aggregate.max.toFixed(2)}{" "}
                {data.aggregate.highVariance && (
                  <span className="badge warn">평가 편차 큼</span>
                )}
              </p>
              {data.reviews.map((r) => (
                <article className="peer-review" key={r.id}>
                  <strong>{r.reviewer_name}</strong>
                  <p>{r.comment}</p>
                </article>
              ))}
            </section>
          )}
        </section>
        <aside className="review-panel">
          <div className="sticky">
            <h2>면접관별 평가</h2>
            <p className="muted">평가자 · {identity.reviewerName}</p>
            {!data.criteria.length && (
              <p role="alert">면접 평가 항목이 설정되지 않았습니다.</p>
            )}
            {data.criteria.map((c) => (
              <fieldset className="criterion" key={c.id}>
                <legend>
                  {c.title} · {Number(c.weight)}%
                </legend>
                {c.description && <p className="hint">{c.description}</p>}
                <div className="score-row">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      type="button"
                      aria-label={`${c.title} ${n}점`}
                      aria-pressed={form.scores[c.id] === n}
                      className={
                        form.scores[c.id] === n ? "score active" : "score"
                      }
                      key={n}
                      onClick={() =>
                        setForm((v) => ({
                          ...v,
                          scores: { ...v.scores, [c.id]: n },
                        }))
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
            <label className="field-label" htmlFor="interview-comment">
              면접관 코멘트
            </label>
            <textarea
              id="interview-comment"
              className="textarea"
              value={form.comment}
              onChange={(e) =>
                setForm((v) => ({ ...v, comment: e.target.value }))
              }
            />
            <div className="review-actions">
              {data.myReview?.status !== "submitted" && (
                <button
                  disabled={busy.review}
                  className="secondary"
                  onClick={() => saveReview("draft")}
                >
                  임시 저장
                </button>
              )}
              <button
                disabled={busy.review || !data.criteria.length}
                onClick={() => saveReview("submitted")}
              >
                {busy.review
                  ? "저장 중…"
                  : data.myReview?.status === "submitted"
                    ? "평가 수정 저장"
                    : "평가 제출"}
              </button>
            </div>
            <p role="status" className="save-message">
              {messages.review}
            </p>
            <p className="hint">
              {!same(form, savedForm)
                ? "저장하지 않은 변경 있음"
                : "저장된 내용"}
            </p>
            <p className="hint">
              면접 점수는 서류 점수와 합산하지 않습니다. 제출한 평가는 수정
              후에도 제출 상태로 유지됩니다.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
