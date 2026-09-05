"use client";
import { useMemo, useState, useRef } from "react";
import { requestJson, jsonRequest } from "@/lib/http";
import { inferColumnMapping } from "@/lib/import/mapping";
import { parseCsvText } from "@/lib/import/parse";
import {
  mappingTargets,
  type ColumnMapping,
  type ParsedCsv,
} from "@/lib/import/types";
import { transformRow } from "@/lib/import/transform";
import { validateApplicant } from "@/lib/import/validate";

const labels: Record<string, string> = {
  ignore: "무시",
  submittedAt: "제출 시각",
  consent: "개인정보 동의",
  name: "성명",
  major: "전공",
  studentNumber: "학번",
  grade: "학년/학기",
  gender: "성별",
  birthDate: "생년월일",
  email: "이메일",
  phone: "전화번호",
  interests: "관심 분야",
  source: "유입 경로",
  interviewAvailability: "면접 가능 시간",
  sessionConfirmation: "세션/비용 확인",
  otMtReason: "OT/MT 사유",
  answerMotivation: "서술형 · 지원동기/자기소개",
  answerActivity: "서술형 · 하고 싶은 활동",
  answerCollaboration: "서술형 · 협업/몰입",
  extra: "기타 원본 보존",
};

export default function ImportClient() {
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [error, setError] = useState("");
  type DbPreview = {
    summary: {
      new: number;
      changed: number;
      existing: number;
      invalid: number;
    };
    snapshot: Record<string, string | null>;
    rows: {
      rowNumber: number;
      name: string;
      state: string;
      errors: string[];
    }[];
  };
  const [dbPreview, setDbPreview] = useState<DbPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const lock = useRef(false);
  async function compareOrCommit(commit = false) {
    if (!parsed || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setResult("");
    try {
      const body = {
        recruitmentId: process.env.NEXT_PUBLIC_RECRUITMENT_ID ?? "",
        rows: parsed.rows,
        mappings,
        ...(commit ? { snapshot: dbPreview?.snapshot } : {}),
      };
      if (commit) {
        const data = await requestJson<{ summary: DbPreview["summary"] }>(
          "/api/import/applicants/commit",
          jsonRequest("POST", body),
        );
        setResult(
          "저장 완료: 신규 " +
            data.summary.new +
            "명 · 변경 " +
            data.summary.changed +
            "명 · 동일 " +
            data.summary.existing +
            "명",
        );
        setDbPreview(null);
      } else
        setDbPreview(
          await requestJson<DbPreview>(
            "/api/import/applicants/preview",
            jsonRequest("POST", body),
          ),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 실패");
      if (commit) setDbPreview(null);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const preview = useMemo(
    () =>
      !parsed
        ? []
        : parsed.rows.slice(0, 10).map((r, i) => {
            const a = transformRow(r, mappings);
            return { i: i + 2, a, errors: validateApplicant(a) };
          }),
    [parsed, mappings],
  );
  const invalidCount = useMemo(
    () =>
      !parsed
        ? 0
        : parsed.rows.reduce(
            (n, r) =>
              n + (validateApplicant(transformRow(r, mappings)).length ? 1 : 0),
            0,
          ),
    [parsed, mappings],
  );

  async function onFile(file?: File) {
    if (!file) return;
    setError("");
    setParsed(null);
    setDbPreview(null);
    setResult("");
    try {
      const result = parseCsvText(await file.text());
      setParsed(result);
      setMappings(inferColumnMapping(result.headers));
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV를 읽지 못했습니다.");
    }
  }

  return (
    <>
      <div className="card">
        <h2>1. Google Form CSV 선택</h2>
        <input
          disabled={busy}
          aria-label="지원자 CSV 파일"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {error && <p className="badge error">{error}</p>}
      </div>
      {parsed && (
        <>
          <div className="card">
            <h2>2. 컬럼 매핑 확인</h2>
            <p className="muted">
              자동 추정 결과를 확인하세요. 알 수 없는 문항은 ‘기타 원본
              보존’으로 저장됩니다.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Google Form 컬럼</th>
                    <th>웹앱 필드</th>
                    <th>추정</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m, idx) => (
                    <tr key={m.header}>
                      <td>{m.header}</td>
                      <td>
                        <select
                          disabled={busy}
                          aria-label={m.header + " 매핑"}
                          value={m.target}
                          onChange={(e) => {
                            setDbPreview(null);
                            setResult("");
                            setMappings((prev) =>
                              prev.map((x, i) =>
                                i === idx
                                  ? {
                                      ...x,
                                      target: e.target
                                        .value as ColumnMapping["target"],
                                    }
                                  : x,
                              ),
                            );
                          }}
                        >
                          {mappingTargets.map((t) => (
                            <option key={t} value={t}>
                              {labels[t]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span
                          className={`badge ${m.confidence === "high" ? "good" : m.confidence === "medium" ? "warn" : ""}`}
                        >
                          {m.confidence}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <h2>3. 가져오기 미리보기</h2>
            <div className="grid">
              <div className="stat">
                CSV 행<strong>{parsed.rows.length}</strong>
              </div>
              <div className="stat">
                컬럼<strong>{parsed.headers.length}</strong>
              </div>
              <div className="stat">
                정상 예상<strong>{parsed.rows.length - invalidCount}</strong>
              </div>
              <div className="stat">
                확인 필요<strong>{invalidCount}</strong>
              </div>
            </div>
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>행</th>
                    <th>성명</th>
                    <th>이메일</th>
                    <th>전화번호</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map(({ i, a, errors }) => (
                    <tr key={i}>
                      <td>{i}</td>
                      <td>{a.name || "—"}</td>
                      <td>{a.email || "—"}</td>
                      <td>{a.phone || "—"}</td>
                      <td>
                        {errors.length ? (
                          <span className="badge error">
                            {errors.join(" / ")}
                          </span>
                        ) : (
                          <span className="badge good">검증 통과</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">
              변경된 지원서는 답변을 갱신하고 기존 지원자 코드와 평가는
              유지합니다. 오류가 있으면 파일을 수정한 뒤 다시 선택하세요.
            </p>
            <button
              disabled={busy || invalidCount > 0 || !parsed.rows.length}
              onClick={() => compareOrCommit()}
            >
              {busy ? "처리 중…" : "DB 중복 비교"}
            </button>
            {dbPreview && (
              <section className="card">
                <h2>4. DB 비교 결과</h2>
                <p>
                  신규 {dbPreview.summary.new}명 · 변경{" "}
                  {dbPreview.summary.changed}명 · 동일{" "}
                  {dbPreview.summary.existing}명 · 오류{" "}
                  {dbPreview.summary.invalid}명
                </p>
                <ul>
                  {dbPreview.rows
                    .filter((r) => r.state !== "existing")
                    .map((r) => (
                      <li key={r.rowNumber}>
                        {r.rowNumber}행 · {r.name} ·{" "}
                        {{
                          new: "신규",
                          changed: "지원서 변경",
                          invalid: "오류",
                        }[r.state] ?? r.state}{" "}
                        {r.errors.join(" / ")}
                      </li>
                    ))}
                </ul>
                <button
                  disabled={
                    busy ||
                    dbPreview.summary.invalid > 0 ||
                    dbPreview.summary.new + dbPreview.summary.changed === 0
                  }
                  onClick={() => compareOrCommit(true)}
                >
                  검증된 지원서 저장
                </button>
              </section>
            )}
            {result && (
              <p role="status">
                {result} ·{" "}
                <a className="quiet-link" href="/applicants">
                  지원자 목록 확인 →
                </a>
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}
