"use client";
import ArchiveButton from "@/app/ArchiveButton";
import { reviewerSetupUrl } from "@/lib/reviewer/navigation";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";

type Status = "pending" | "reviewing" | "hold" | "interview" | "rejected";
type Applicant = {
  id: string;
  applicant_code: string;
  name: string;
  major: string | null;
  interests: string[];
  document_status: Status;
  review_count: number;
  minimum_review_count: number;
  review_shortage: boolean;
  document_average: number | null;
  document_min: number | null;
  document_max: number | null;
  high_variance: boolean;
  my_review_status: "draft" | "submitted" | null;
};

export default function ApplicantsClient() {
  const [reviewer, setReviewer] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [rows0, setRows0] = useState<Applicant[]>([]);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("code");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const statusLocks = useRef(new Set<string>());
  const [statusBusy, setStatusBusy] = useState<Record<string,boolean>>({});
  const recruitmentId = process.env.NEXT_PUBLIC_RECRUITMENT_ID ?? "";
  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(
        `/api/applicants/summary?reviewerId=${encodeURIComponent(id)}&recruitmentId=${encodeURIComponent(recruitmentId)}`,
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "조회 실패");
      setRows0(d.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [recruitmentId]);
  useEffect(() => {
    const n = localStorage.getItem("coffeeright.reviewerName");
    const id = localStorage.getItem("coffeeright.reviewerId");
    if (!n || !id) {
      location.href = reviewerSetupUrl();
      return;
    }
    setReviewer(n);
    setReviewerId(id);
    load(id);
  }, [load]);
  const rows = useMemo(() => {
    const result = rows0.filter((a) =>
      filter === "all"
        ? true
        : filter === "mine"
          ? a.my_review_status !== "submitted"
          : filter === "low"
            ? a.review_shortage
            : filter === "interview"
              ? a.document_status === "interview"
              : filter === "hold"
                ? a.document_status === "hold"
                : true,
    );
    return [...result].sort((a, b) =>
      sort === "average"
        ? (b.document_average ?? -1) - (a.document_average ?? -1)
        : sort === "reviews"
          ? a.review_count - b.review_count
          : sort === "name"
            ? a.name.localeCompare(b.name, "ko")
            : a.applicant_code.localeCompare(b.applicant_code, undefined, {
                numeric: true,
              }),
    );
  }, [rows0, filter, sort]);
  const submitted = rows0.filter(
    (x) => x.my_review_status === "submitted",
  ).length;
  const interviewCount = rows0.filter(
    (x) => x.document_status === "interview",
  ).length;
  const shortage = rows0.filter((x) => x.review_shortage).length;
  async function changeStatus(id: string, status: Status) {
    if(statusLocks.current.has(id))return;
    statusLocks.current.add(id);setStatusBusy(v=>({...v,[id]:true}));
    try {
    const r = await fetch(`/api/applicants/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const d = await r.json();
    if (!r.ok) {
      alert(d.error ?? "상태 변경 실패");
      return;
    }
    setRows0((prev) =>
      prev.map((x) => (x.id === id ? { ...x, document_status: status } : x)),
    );
    }catch(error){alert(error instanceof Error?error.message:"상태 변경 실패");}
    finally{statusLocks.current.delete(id);setStatusBusy(v=>({...v,[id]:false}));}
  }
  return (
    <main>
      <header className="page-head">
        <div>
          <p className="eyebrow">COFFEERIGHT · 6기 리크루팅</p>
          <h1>서류 평가</h1>
          <p className="muted">
            {reviewer || "평가자"} · 내 제출 {submitted}/{rows0.length}
          </p>
        </div>
        <div className="head-actions">
          <a className="quiet-link" href="/import">
            CSV 가져오기
          </a>
          <ArchiveButton type="document_final" label="서류 종료본 다운로드" />
        </div>
      </header>
      <section className="summary-grid">
        <div className="summary-card">
          <span>전체 지원자</span>
          <strong>{rows0.length}</strong>
        </div>
        <div className="summary-card">
          <span>평가 부족</span>
          <strong>{shortage}</strong>
        </div>
        <div className="summary-card">
          <span>면접 대상</span>
          <strong>{interviewCount}</strong>
        </div>
        <div className="summary-card">
          <span>내 남은 평가</span>
          <strong>{Math.max(rows0.length - submitted, 0)}</strong>
        </div>
      </section>
      <div className="toolbar">
        <div className="filter-row">
          <button
            className={filter === "all" ? "filter active" : "filter"}
            onClick={() => setFilter("all")}
          >
            전체
          </button>
          <button
            className={filter === "mine" ? "filter active" : "filter"}
            onClick={() => setFilter("mine")}
          >
            내가 미평가
          </button>
          <button
            className={filter === "low" ? "filter active" : "filter"}
            onClick={() => setFilter("low")}
          >
            평가 부족
          </button>
          <button
            className={filter === "interview" ? "filter active" : "filter"}
            onClick={() => setFilter("interview")}
          >
            면접 대상
          </button>
          <button
            className={filter === "hold" ? "filter active" : "filter"}
            onClick={() => setFilter("hold")}
          >
            보류
          </button>
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="code">지원자 번호순</option>
          <option value="average">서류 평균 높은순</option>
          <option value="reviews">평가 적은순</option>
          <option value="name">이름순</option>
        </select>
      </div>
      {loading ? (
        <div className="empty">지원자를 불러오는 중입니다.</div>
      ) : error ? (
        <div className="empty" role="alert">
          {error}
          <p>
            <button onClick={() => load(reviewerId)}>다시 시도</button>
          </p>
        </div>
      ) : (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>지원자</th>
                <th>관심 분야</th>
                <th>내 평가</th>
                <th>평가 수</th>
                <th>서류 평균</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <a className="quiet-link" href={`/applicants/${a.id}`}>
                      <strong>
                        {a.applicant_code} · {a.name}
                      </strong>
                    </a>
                    <div className="muted small">
                      {a.major || "전공 미입력"}
                    </div>
                  </td>
                  <td>{(a.interests || []).join(" · ") || "-"}</td>
                  <td>
                    <span
                      className={`badge ${a.my_review_status === "submitted" ? "good" : a.my_review_status === "draft" ? "warn" : ""}`}
                    >
                      {a.my_review_status === "submitted"
                        ? "완료"
                        : a.my_review_status === "draft"
                          ? "임시저장"
                          : "미평가"}
                    </span>
                  </td>
                  <td>
                    {a.review_count}/{a.minimum_review_count}{" "}
                    {a.review_shortage && (
                      <span className="badge warn">부족</span>
                    )}
                  </td>
                  <td>
                    {a.my_review_status !== "submitted" ? (
                      <span className="muted">제출 후 공개</span>
                    ) : a.document_average == null ? (
                      "-"
                    ) : (
                      <>
                        {a.document_average.toFixed(2)}{" "}
                        {a.high_variance && (
                          <span className="badge warn">편차 큼</span>
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    <select
                      className="status-select"
                      disabled={statusBusy[a.id]}
                      aria-label={a.applicant_code+" 서류 상태"}
                      value={a.document_status}
                      onChange={(e) =>
                        changeStatus(a.id, e.target.value as Status)
                      }
                    >
                      <option value="pending">미결정</option>
                      <option value="reviewing">검토 중</option>
                      <option value="hold">보류</option>
                      <option value="interview">면접</option>
                      <option value="rejected">서류 탈락</option>
                    </select>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    조건에 맞는 지원자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
