"use client";
import { useEffect, useState } from "react";
import { getOrCreateReviewerIdentity } from "@/lib/reviewer/identity";
import { safeReturnPath } from "@/lib/reviewer/navigation";

export default function ReviewerClient() {
  const [name, setName] = useState("");
  useEffect(() => {
    setName(localStorage.getItem("coffeeright.reviewerName") ?? "");
  }, []);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    getOrCreateReviewerIdentity(name);
    window.location.href = safeReturnPath(
      new URLSearchParams(location.search).get("next"),
    );
  }
  return (
    <main className="narrow">
      <p className="eyebrow">COFFEERIGHT · RECRUITING REVIEW</p>
      <h1>6기 리크루팅 평가</h1>
      <p className="lead">
        평가에 사용할 이름을 입력해주세요. 이 브라우저에만 저장됩니다.
      </p>
      <form className="card form-stack" onSubmit={submit}>
        <label className="field-label">평가자 이름</label>
        <input
          className="text-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 김민규"
          autoFocus
        />
        <button type="submit">평가 시작하기</button>
        <p className="hint">
          같은 이름이라도 브라우저별 reviewer ID로 평가를 구분합니다.
        </p>
      </form>
    </main>
  );
}
