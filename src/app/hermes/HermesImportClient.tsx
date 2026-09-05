"use client";
import { useState, useRef } from "react";
import Papa from "papaparse";
import { downloadFile } from "@/lib/archive/download";

type Preview = {
  valid: Array<{
    applicant_code: string;
    application_summary: string;
    recommended_questions: string[];
  }>;
  errors: string[];
  missing: string[];
  canCommit: boolean;
};

export default function HermesImportClient() {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const recruitmentId = process.env.NEXT_PUBLIC_RECRUITMENT_ID ?? "";
  async function read(file: File) {
    setMessage("");
    setPreview(null);
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed: unknown = JSON.parse(text);
        const list=Array.isArray(parsed)?parsed:parsed&&typeof parsed==="object"?(parsed as {rows?:unknown}).rows:null;
        if(!Array.isArray(list)||!list.length||list.some(row=>!row||typeof row!=="object"||Array.isArray(row)))throw new Error("결과는 지원자 객체의 JSON 배열이어야 합니다.");
        setRows(list);
      } else {
        const parsed = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
        });
        if (parsed.errors.length) throw new Error(parsed.errors[0].message);
        setRows(parsed.data);
      }
    } catch (e) {
      setRows([]);
      setMessage(e instanceof Error ? e.message : "파일을 읽지 못했습니다.");
    }
  }
  async function submit(action: "preview" | "commit") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const reviewerId = localStorage.getItem("coffeeright.reviewerId");
      const reviewerName = localStorage.getItem("coffeeright.reviewerName");
      const response = await fetch("/api/import/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          rows,
          recruitmentId,
          reviewerId,
          reviewerName,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setPreview(
          Array.isArray(data.valid) &&
            Array.isArray(data.errors) &&
            Array.isArray(data.missing)
            ? data
            : null,
        );
        setMessage(data.error ?? "가져오기 실패");
        return;
      }
      if (action === "preview") {
        setPreview(data);
        setMessage(`검증 완료: ${data.valid.length}명`);
      } else {
        setMessage(`${data.imported}명의 Hermes 결과를 저장했습니다.`);
        setPreview(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "요청 실패");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function exportInput(format: "json" | "csv") {
    setBusy(true);
    try {
      await downloadFile(
        "/api/export/hermes?recruitmentId=" +
          encodeURIComponent(recruitmentId) +
          "&format=" +
          format,
        "coffeeright-hermes-input." + format,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "내보내기 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="narrow">
      <div className="review-top">
        <a className="quiet-link" href="/interviews">
          ← 면접 대상 목록
        </a>
        <span className="muted">Hermes 일괄 처리</span>
      </div>
      <h1>Hermes 결과 가져오기</h1>
      <p className="lead">
        지원자 코드, 지원서 요약, 추천 질문을 JSON 또는 CSV로 가져옵니다. 지원자
        코드로만 연결하며 가져오기 전에 누락·중복·미존재 코드를 검증합니다.
      </p>
      <section className="card">
        <h2>1. 면접 대상 지원서 내보내기</h2>
        <p className="hint">
          지원자 코드와 답변을 내려받아 외부에서 요약·질문을 생성하세요. 파일은
          자동 전송되지 않습니다.
        </p>
        <div className="row">
          <button disabled={busy} onClick={() => exportInput("json")}>
            입력 JSON 다운로드
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => exportInput("csv")}
          >
            입력 CSV 다운로드
          </button>
        </div>
        <details>
          <summary>결과 JSON 예시</summary>
          <pre>
            {JSON.stringify(
              [
                {
                  applicant_code: "C6-001",
                  application_summary: "지원서에 근거한 요약",
                  recommended_questions: [
                    "지원서에서 언급한 활동을 구체적으로 설명해주세요.",
                  ],
                },
              ],
              null,
              2,
            )}
          </pre>
        </details>
      </section>
      <section className="card form-stack">
        <h2>2. 생성한 결과 가져오기</h2>
        <label className="field-label">결과 파일</label>
        <input
          aria-label="Hermes 결과 파일"
          disabled={busy}
          type="file"
          accept=".json,.csv,text/csv,application/json"
          onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
        />
        <p className="hint">
          필수 열: applicant_code, application_summary, recommended_questions.
          CSV의 질문 여러 개는 줄바꿈 또는 | 로 구분할 수 있습니다.
        </p>
        <div className="row">
          <button
            disabled={busy || !rows.length}
            onClick={() => submit("preview")}
          >
            가져오기 전 검증
          </button>
          {preview?.canCommit && (
            <button
              disabled={busy}
              className="secondary"
              onClick={() => submit("commit")}
            >
              검증된 {preview.valid.length}명 저장
            </button>
          )}
        </div>
        {message && <p className="save-message">{message}</p>}
      </section>
      {preview && (
        <section className="card">
          <h2>검증 결과</h2>
          <p>
            정상 {preview.valid.length}명 · 오류 {preview.errors.length}건 ·
            파일에 없는 면접 대상 {preview.missing.length}명
          </p>
          <p className="hint">
            해당 지원자의 기존 Hermes 결과는 덮어씁니다. 파일에 없는 지원자의
            결과는 유지합니다.
          </p>
          {preview.valid.map((row) => (
            <article key={row.applicant_code}>
              <strong>{row.applicant_code}</strong>
              <p>{row.application_summary}</p>
              <ul>
                {row.recommended_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </article>
          ))}
          {preview.errors.length > 0 && (
            <ul className="error-list">
              {preview.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          {preview.missing.length > 0 && (
            <p className="hint">누락 코드: {preview.missing.join(", ")}</p>
          )}
        </section>
      )}
    </main>
  );
}
