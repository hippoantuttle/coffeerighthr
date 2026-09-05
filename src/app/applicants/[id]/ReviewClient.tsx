"use client";
import { useUnsavedChanges } from "@/lib/hooks/useUnsavedChanges";
import { getStoredReviewerIdentity } from "@/lib/reviewer/identity";
import { reviewerSetupUrl } from "@/lib/reviewer/navigation";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
type Criterion = {
  id: string;
  title: string;
  description: string | null;
  weight: number;
};
type Applicant = {
  id: string;
  applicant_code: string;
  name: string;
  major: string | null;
  student_number: string | null;
  grade: string | null;
  gender: string | null;
  birth_date: string | null;
  email: string;
  phone: string | null;
  interests: string[];
  answers: { question_label: string; answer: string }[];
};
type Aggregate = {
  average: number;
  min: number;
  max: number;
  count: number;
  highVariance: boolean;
};
type PeerReview = {
  reviewerName: string;
  comment: string | null;
  average: number | null;
  submittedAt: string | null;
};
export default function ReviewClient({
  applicant,
  criteria,
  neighbors = [],
}: {
  applicant: Applicant;
  criteria: Criterion[];
  neighbors: { id: string; applicant_code: string }[];
}) {
  const [reviewerId, setReviewerId] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"draft" | "submitted" | null>(null);
  const [message, setMessage] = useState("");
  const [aggregate, setAggregate] = useState<Aggregate | null>(null);
  const [peerReviews, setPeerReviews] = useState<PeerReview[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const lock = useRef(false);
  const [baseline, setBaseline] = useState(
    JSON.stringify({ scores: {}, comment: "" }),
  );
  useUnsavedChanges(JSON.stringify({ scores, comment }) !== baseline);
  const load = useCallback(async (id: string, initialize = true) => {
    const r = await fetch(
      `/api/applicants/${applicant.id}/review?reviewerId=${encodeURIComponent(id)}`,
    );
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? "조회 실패");
    if (d.review && initialize) {
      setBaseline(
        JSON.stringify({
          scores: Object.fromEntries(
            (d.scores ?? []).map(
              (x: { criterion_id: string; score: number }) => [
                x.criterion_id,
                x.score,
              ],
            ),
          ),
          comment: d.review.comment ?? "",
        }),
      );
      setStatus(d.review.status);
      setComment(d.review.comment ?? "");
      setScores(
        Object.fromEntries(
          (d.scores ?? []).map((x: { criterion_id: string; score: number }) => [
            x.criterion_id,
            x.score,
          ]),
        ),
      );
    }
    setAggregate(d.aggregate ?? null);
    setPeerReviews(d.peerReviews ?? []);
    if(initialize)setReady(true);
  }, [applicant.id]);
  useEffect(() => {
    const identity = getStoredReviewerIdentity();
    if (!identity) {
      location.href = reviewerSetupUrl();
      return;
    }
    setReviewerId(identity.reviewerId);
    setReviewerName(identity.reviewerName);
    load(identity.reviewerId).catch((e) => setMessage(e.message));
  }, [load]);
  const complete = useMemo(
    () =>
      criteria.length > 0 &&
      criteria.every((c) => scores[c.id] >= 1 && scores[c.id] <= 5),
    [criteria, scores],
  );
  async function save(next: "draft" | "submitted") {
    if (lock.current) return;
    if ((next === "submitted" || status === "submitted") && !complete) {
      setMessage("설정된 모든 평가 항목에 점수를 입력해주세요.");
      return;
    }
    const sent = { scores: { ...scores }, comment };
    lock.current = true;
    setBusy(true);
    setMessage("저장 중…");
    try {
      const r = await fetch(`/api/applicants/${applicant.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerId,
          reviewerName,
          status: next,
          ...sent,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "저장 실패");
      setStatus(d.status);
      setBaseline(JSON.stringify(sent));
      setMessage(
        d.status === "submitted"
          ? "전송한 평가 저장 완료"
          : "전송한 평가 임시 저장됨",
      );
      try {
        await load(reviewerId, false);
      } catch {
        setMessage(
          "평가는 저장되었습니다. 다른 평가 현황 갱신은 실패했습니다.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "저장 실패. 다시 시도해주세요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if(!ready)return <main><a className="quiet-link" href="/applicants">← 지원자 목록</a><p role="status">{message||"평가 정보를 불러오는 중입니다."}</p>{message&&<button onClick={()=>load(reviewerId).catch(error=>setMessage(error.message))}>다시 시도</button>}</main>;
  return (
    <main>
      <div className="review-top">
        <a className="quiet-link" href="/applicants">
          ← 지원자 목록
        </a>
        <div className="row">
          {neighbors.map((n) => (
            <a className="quiet-link" key={n.id} href={`/applicants/${n.id}`}>
              {n.applicant_code} →
            </a>
          ))}
          <span className="muted">{applicant.applicant_code}</span>
        </div>
      </div>
      <div className="review-layout">
        <section>
          <p className="eyebrow">{applicant.applicant_code}</p>
          <h1>{applicant.name}</h1>
          <p className="lead">
            {applicant.major || "전공 미입력"} ·{" "}
            {applicant.grade || "학년/학기 미입력"}
          </p>
          <div className="meta-line">
            {(applicant.interests || []).join(" · ")}
          </div>
          <details className="details">
            <summary>기본정보 더 보기</summary>
            <dl className="meta-grid">
              <div>
                <dt>학번</dt>
                <dd>{applicant.student_number || "-"}</dd>
              </div>
              <div>
                <dt>이메일</dt>
                <dd>{applicant.email}</dd>
              </div>
              <div>
                <dt>전화번호</dt>
                <dd>{applicant.phone || "-"}</dd>
              </div>
              <div>
                <dt>생년월일</dt>
                <dd>{applicant.birth_date || "-"}</dd>
              </div>
            </dl>
          </details>
          <div className="answers">
            {applicant.answers.map((a, i) => (
              <article className="answer" key={i}>
                <p className="question">{a.question_label}</p>
                <p>{a.answer}</p>
              </article>
            ))}
          </div>
          {status === "submitted" && (
            <section className="peer-section">
              <p className="eyebrow">평가 현황</p>
              {aggregate && (
                <div className="summary-card">
                  <strong>전체 평균 {aggregate.average.toFixed(2)}</strong>
                  <span>
                    {" "}
                    · 제출 {aggregate.count}명 · 범위 {aggregate.min.toFixed(2)}
                    –{aggregate.max.toFixed(2)}
                  </span>
                  {aggregate.highVariance && (
                    <span className="badge warn">평가 편차 큼</span>
                  )}
                </div>
              )}
              {peerReviews.map((r, i) => (
                <article className="peer-review" key={`${r.reviewerName}-${i}`}>
                  <div>
                    <strong>{r.reviewerName}</strong>
                    {r.average != null && (
                      <span> · {r.average.toFixed(2)}</span>
                    )}
                  </div>
                  {r.comment && <p>{r.comment}</p>}
                </article>
              ))}
            </section>
          )}
        </section>
        <aside className="review-panel">
          <div className="sticky">
            <p className="eyebrow">나의 서류평가</p>
            <p className="muted small">평가자 · {reviewerName || "-"}</p>
            {criteria.map((c) => (
              <div className="criterion" key={c.id}>
                <div className="criterion-head">
                  <strong>{c.title}</strong>
                  <span>{Math.round(Number(c.weight))}%</span>
                </div>
                {c.description && <p className="hint">{c.description}</p>}
                <div className="score-row">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      type="button"
                      aria-label={c.title + " " + n + "점"}
                      aria-pressed={scores[c.id] === n}
                      className={scores[c.id] === n ? "score active" : "score"}
                      key={n}
                      onClick={() => setScores((s) => ({ ...s, [c.id]: n }))}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="score-anchors">
              <span>1 · 근거 부족</span>
              <span>3 · 의지는 있으나 추상적</span>
              <span>5 · 구체적 경험/계획</span>
            </div>
            <label className="field-label" htmlFor="document-comment">
              개인 코멘트
            </label>
            <textarea
              id="document-comment"
              className="textarea"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="면접에서 확인할 점이나 평가 근거를 남겨주세요."
            />
            <div className="review-actions">
              {status !== "submitted" && (
                <button
                  disabled={busy}
                  className="secondary"
                  onClick={() => save("draft")}
                >
                  임시 저장
                </button>
              )}
              <button
                disabled={busy || !criteria.length}
                onClick={() => save("submitted")}
              >
                {status === "submitted" ? "평가 수정 저장" : "평가 제출"}
              </button>
            </div>
            {message && (
              <p role="status" className="save-message">
                {message}
              </p>
            )}
            <p className="hint">
              {JSON.stringify({ scores, comment }) !== baseline
                ? "저장하지 않은 변경 있음"
                : ""}
            </p>
            {!criteria.length && (
              <p role="alert">서류 평가 항목이 설정되지 않았습니다.</p>
            )}
            {status === "submitted" ? (
              <p className="hint">
                제출 이후에는 다른 평가자의 제출 완료 결과가 공개됩니다. 수정한
                평가는 제출 상태로 유지됩니다.
              </p>
            ) : (
              <p className="hint">
                평가 제출 전에는 다른 평가자의 점수와 코멘트가 공개되지
                않습니다.
              </p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
