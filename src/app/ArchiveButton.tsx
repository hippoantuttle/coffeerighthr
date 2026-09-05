"use client";
import { useRef, useState } from "react";
import { downloadFile } from "@/lib/archive/download";
import { jsonRequest } from "@/lib/http";

export default function ArchiveButton({
  type,
  label,
}: {
  type: "document_final" | "interview_final" | "full_final";
  label: string;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  async function download(includePersonalData: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await downloadFile(
        type === "document_final"
          ? "/api/archive/document-final"
          : `/api/archive/${type}`,
        `coffeeright-${type}-${new Date().toISOString().slice(0, 10)}.zip`,
        jsonRequest("POST", {
          includePersonalData,
          recruitmentId: process.env.NEXT_PUBLIC_RECRUITMENT_ID,
          reviewerId: localStorage.getItem("coffeeright.reviewerId"),
          reviewerName: localStorage.getItem("coffeeright.reviewerName"),
        }),
      );
      setOpen(false);
      setMessage("다운로드 완료");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "다운로드 실패");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="archive-control">
      <button
        className="secondary"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        {busy ? "ZIP 생성 중…" : label}
      </button>
      {open && (
        <fieldset className="archive-options">
          <legend>내보내기 범위</legend>
          <p className="hint">
            기본정보를 제외해도 자유서술 답변·평가자 이름·코멘트는 포함됩니다.
            현재 기록을 내려받으며 이후 평가를 잠그지 않습니다.
          </p>
          <div className="row">
            <button disabled={busy} onClick={() => download(true)}>
              개인정보 포함
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => download(false)}
            >
              기본 개인정보 열 제외
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              취소
            </button>
          </div>
        </fieldset>
      )}
      <span role="status" className="hint">
        {message}
      </span>
    </div>
  );
}
