"use client";
import { useEffect, useRef, useState } from "react";
import ArchiveButton from "@/app/ArchiveButton";
import { HttpError, jsonRequest, requestJson } from "@/lib/http";
import { reviewerSetupUrl } from "@/lib/reviewer/navigation";
import { useUnsavedChanges } from "@/lib/hooks/useUnsavedChanges";

type Assignment = {
  scheduled_at: string | null;
  duration_minutes: number;
  interviewer_names: string[];
  room: string | null;
  mode: "offline" | "online";
};
type Status = "pending" | "accepted" | "waitlisted" | "rejected" | "hold";
const labels: Record<Status, string> = {
  pending: "미결정",
  accepted: "합격",
  waitlisted: "대기",
  rejected: "탈락",
  hold: "보류",
};
type Row = {
  id: string;
  applicant_code: string;
  name: string;
  major: string | null;
  interview_availability: string | null;
  final_status: Status;
  final_version: number;
  assignment: Assignment | null;
  hermes_ready: boolean;
  review_count: number;
  minimum_review_count: number;
  review_shortage: boolean;
  interview_average: number | null;
  interview_min: number | null;
  interview_max: number | null;
  high_variance: boolean;
};
type Identity = { reviewerId: string; reviewerName: string };
function localInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export default function InterviewsClient() {
  const [rows, setRows] = useState<Row[]>([]),
    [identity, setIdentity] = useState<Identity>({
      reviewerId: "",
      reviewerName: "",
    });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("all"),
    [finalFilter, setFinalFilter] = useState("all"),
    [target, setTarget] = useState<number | null>(null);
  const [dirtyRows, setDirtyRows] = useState<Record<string, boolean>>({});
  const dirty = Object.values(dirtyRows).some(Boolean);
  useUnsavedChanges(dirty);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const body = await requestJson<{
        rows: Row[];
        finalTargetCount: number | null;
      }>(
        `/api/interviews/summary?recruitmentId=${encodeURIComponent(process.env.NEXT_PUBLIC_RECRUITMENT_ID ?? "")}`,
      );
      setRows(body.rows);
      setTarget(body.finalTargetCount);
    } catch (error) {
      setError(error instanceof Error ? error.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const reviewerId = localStorage.getItem("coffeeright.reviewerId"),
      reviewerName = localStorage.getItem("coffeeright.reviewerName");
    if (!reviewerId || !reviewerName) {
      location.href = reviewerSetupUrl();
      return;
    }
    setIdentity({ reviewerId, reviewerName });
    void load();
  }, []);
  const visible = rows.filter(
    (r) =>
      (filter === "unscheduled"
        ? !r.assignment?.scheduled_at
        : filter === "shortage"
          ? r.review_shortage
          : filter === "variance"
            ? r.high_variance
            : true) &&
      (finalFilter === "all" || r.final_status === finalFilter),
  );
  const counts = Object.fromEntries(
    Object.keys(labels).map((status) => [
      status,
      rows.filter((r) => r.final_status === status).length,
    ]),
  );
  function allowFilter() {
    return (
      !dirty ||
      confirm(
        "시간 배정에 저장하지 않은 변경이 있습니다. 필터를 변경하면 입력이 사라질 수 있습니다. 계속할까요?",
      )
    );
  }
  return (
    <main>
      <header className="page-head">
        <div>
          <p className="eyebrow">COFFEERIGHT · 면접 운영</p>
          <h1>면접·최종 선발</h1>
          <p className="muted">
            {identity.reviewerName} · 대상 {rows.length}명
            {target != null && ` · 최종 선발 목표 ${target}명`}
          </p>
        </div>
        <div className="head-actions">
          <a href="/hermes" className="quiet-link">
            Hermes 가져오기
          </a>
          <ArchiveButton type="interview_final" label="면접 종료 ZIP" />
          <ArchiveButton type="full_final" label="전체 최종 ZIP" />
        </div>
      </header>
      <div className="summary-grid final-summary">
        {(Object.entries(labels) as [Status, string][]).map(
          ([status, label]) => (
            <div className="summary-card" key={status}>
              <span>{label}</span>
              <strong>{counts[status]}</strong>
            </div>
          ),
        )}
      </div>
      {target != null && counts.accepted > target && (
        <p className="badge warn">
          합격 인원이 목표보다 많습니다. 운영진의 최종 결정을 확인해주세요.
        </p>
      )}
      <div className="toolbar">
        <div className="filter-row">
          {[
            ["all", "전체"],
            ["unscheduled", "시간 미배정"],
            ["shortage", "평가 부족"],
            ["variance", "편차 경고"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "filter active" : "filter"}
              onClick={() => {
                if (allowFilter()) setFilter(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          최종 상태{" "}
          <select
            value={finalFilter}
            onChange={(e) => {
              if (allowFilter()) setFinalFilter(e.target.value);
            }}
          >
            <option value="all">전체 상태</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <div className="empty" role="alert">
          {error}
          <p>
            <button onClick={() => void load()}>다시 시도</button>
          </p>
        </div>
      ) : loading ? (
        <p className="empty">면접 현황을 불러오는 중입니다.</p>
      ) : (
        <div className="interview-list">
          {visible.map((row) => (
            <InterviewRow
              key={row.id}
              row={row}
              identity={identity}
              onDirty={(value) =>
                setDirtyRows((v) =>
                  v[row.id] === value ? v : { ...v, [row.id]: value },
                )
              }
              update={(changes) =>
                setRows((v) =>
                  v.map((r) => (r.id === row.id ? { ...r, ...changes } : r)),
                )
              }
            />
          ))}
          {!visible.length && (
            <p className="empty">조건에 맞는 면접 대상자가 없습니다.</p>
          )}
        </div>
      )}
    </main>
  );
}

function InterviewRow({
  row,
  identity,
  update,
  onDirty,
}: {
  row: Row;
  identity: Identity;
  update: (changes: Partial<Row>) => void;
  onDirty: (value: boolean) => void;
}) {
  const [schedule, setSchedule] = useState({
    time: localInput(row.assignment?.scheduled_at ?? null),
    room: row.assignment?.room ?? "",
    interviewers: (row.assignment?.interviewer_names ?? []).join(", "),
  });
  const [saved, setSaved] = useState(schedule),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [status, setStatus] = useState(row.final_status);
  const lock = useRef(false);
  const dirty = JSON.stringify(schedule) !== JSON.stringify(saved);
  const dirtyCallback = useRef(onDirty);
  useEffect(() => {
    dirtyCallback.current = onDirty;
  });
  useEffect(() => {
    dirtyCallback.current(dirty);
    return () => dirtyCallback.current(false);
  }, [dirty]);
  async function save(final = false) {
    if (lock.current) return;
    if(final&&dirty&&!confirm("저장하지 않은 시간 배정이 있습니다. 최종 상태만 저장할까요? 필터에 따라 이 행이 숨겨지면 시간 입력은 사라질 수 있습니다."))return;
    if (
      final &&
      row.review_shortage &&
      !confirm("아직 면접 평가가 부족합니다. 선택한 최종 상태를 저장할까요?")
    )
      return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    const sent = { ...schedule };
    try {
      if (final) {
        const body = await requestJson<{
          applicant: { final_status: Status; final_version: number };
        }>(
          `/api/applicants/${row.id}/final`,
          jsonRequest("PATCH", {
            status,
            version: row.final_version,
            ...identity,
          }),
        );
        update(body.applicant);
        setMessage("최종 상태를 저장했습니다.");
      } else {
        const body = await requestJson<{ assignment: Assignment }>(
          `/api/interviews/${row.id}`,
          jsonRequest("PATCH", {
            action: "schedule",
            scheduledAt: sent.time ? new Date(sent.time).toISOString() : null,
            room: sent.room,
            interviewerNames: sent.interviewers
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
            durationMinutes: row.assignment?.duration_minutes ?? 20,
            mode: row.assignment?.mode ?? "offline",
            ...identity,
          }),
        );
        update({ assignment: body.assignment });
        setSaved(sent);
        setMessage("시간 배정을 저장했습니다.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
      if (final && error instanceof HttpError && error.status === 409) {
        try {
          const body = await requestJson<{ rows: Row[] }>(
            `/api/interviews/summary?recruitmentId=${encodeURIComponent(process.env.NEXT_PUBLIC_RECRUITMENT_ID ?? "")}`,
          );
          const latest = body.rows.find((r) => r.id === row.id);
          if (latest) {
            update({
              final_status: latest.final_status,
              final_version: latest.final_version,
            });
            setStatus(latest.final_status);
            setMessage(
              `다른 변경이 먼저 저장되었습니다. 현재 상태: ${labels[latest.final_status]}. 다시 선택해주세요.`,
            );
          }
        } catch {
          /* Keep original conflict visible. */
        }
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <article className="interview-row">
      <div className="interview-main">
        <a href={`/interviews/${row.id}`}>
          <strong>
            {row.applicant_code} · {row.name}
          </strong>
        </a>
        <span className="muted small">
          {row.major ?? "전공 미입력"} · 가능 시간{" "}
          {row.interview_availability ?? "미입력"}
        </span>
        <div className="badge-row">
          <span className={row.hermes_ready ? "badge good" : "badge warn"}>
            {row.hermes_ready ? "Hermes 완료" : "Hermes 미입력"}
          </span>
          <span className={row.review_shortage ? "badge warn" : "badge good"}>
            평가 {row.review_count}/{row.minimum_review_count}
          </span>
          {row.interview_average != null && (
            <span className="badge">
              평균 {row.interview_average.toFixed(2)}
            </span>
          )}
          {row.high_variance && <span className="badge warn">편차 큼</span>}
          <span className="badge">{labels[row.final_status]}</span>
        </div>
      </div>
      <div>
        <div className="schedule-grid">
          <label className="small">
            면접 일시
            <input
              className="text-input"
              type="datetime-local"
              value={schedule.time}
              onChange={(e) =>
                setSchedule((v) => ({ ...v, time: e.target.value }))
              }
            />
          </label>
          <label className="small">
            장소/링크
            <input
              className="text-input"
              value={schedule.room}
              onChange={(e) =>
                setSchedule((v) => ({ ...v, room: e.target.value }))
              }
            />
          </label>
          <label className="small">
            면접관 (쉼표 구분)
            <input
              className="text-input"
              value={schedule.interviewers}
              onChange={(e) =>
                setSchedule((v) => ({ ...v, interviewers: e.target.value }))
              }
            />
          </label>
          <button disabled={busy} onClick={() => void save()}>
            시간 배정
          </button>
        </div>
        <div className="row final-actions">
          <label>
            최종 상태{" "}
            <select
              disabled={busy}
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
            >
              {Object.entries(labels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary"
            disabled={busy || status === row.final_status}
            onClick={() => void save(true)}
          >
            최종 상태 저장
          </button>
        </div>
        <p className="hint">
          {dirty ? "시간 배정에 저장하지 않은 변경 있음" : ""}
        </p>
        <p role="status" className="save-message">
          {message}
        </p>
      </div>
    </article>
  );
}
