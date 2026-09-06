// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import InterviewClient from "../src/app/interviews/[id]/InterviewClient";
const payload = {
  applicant: {
    applicant_code: "C6-001",
    name: "QA 지원자",
    major: "전공",
    grade: "1",
    interview_availability: "14시",
  },
  answers: [],
  criteria: [{ id: "c1", title: "탐구", description: "", weight: 100 }],
  questions: [
    { id: "q1", question: "질문 하나", description: "" },
    { id: "q2", question: "질문 둘", description: "" },
  ],
  notes: [],
  artifact: null,
  aggregate: null,
  reviews: [],
  myReview: null,
  myScores: [],
  reviewerLimit: 3,
  reviewerCount: 0,
  canReview: true,
};
const response = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
beforeEach(() => {
  localStorage.setItem("coffeeright.reviewerId", "qa");
  localStorage.setItem("coffeeright.reviewerName", "QA");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("interview form preserves unsaved input", () => {
  it("blocks a fourth new evaluator when three people already participate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        response({
          ...payload,
          reviewerCount: 3,
          canReview: false,
        }),
      ),
    );
    render(<InterviewClient applicantId="a1" />);
    await screen.findByText("이 지원자는 이미 평가자 3명이 참여했습니다.");
    expect(
      (screen.getByRole("button", { name: "탐구 5점" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "평가 제출" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("keeps scores, comment, other notes and text typed during a slow save", async () => {
    let resolveSave: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) =>
        init
          ? new Promise<Response>((resolve) => {
              resolveSave = resolve;
            })
          : response(payload),
      ),
    );
    render(<InterviewClient applicantId="a1" />);
    const note = await screen.findByLabelText("질문 하나");
    fireEvent.change(screen.getByLabelText("면접관 코멘트"), {
      target: { value: "개인 평가 미저장" },
    });
    fireEvent.click(screen.getByRole("button", { name: "탐구 5점" }));
    fireEvent.change(screen.getByLabelText("질문 둘"), {
      target: { value: "다른 질문 미저장" },
    });
    fireEvent.change(note, { target: { value: "첫 메모" } });
    fireEvent.click(screen.getAllByRole("button", { name: "메모 저장" })[0]);
    fireEvent.change(note, { target: { value: "첫 메모 + 저장 중 추가" } });
    resolveSave(
      new Response(
        JSON.stringify({
          note: {
            question_id: "q1",
            note: "첫 메모",
            version: 1,
            updated_by_name: "QA",
            updated_at: "now",
          },
        }),
      ),
    );
    await screen.findByText("전송한 메모를 저장했습니다.");
    expect((note as HTMLTextAreaElement).value).toBe("첫 메모 + 저장 중 추가");
    expect(
      (screen.getByLabelText("질문 둘") as HTMLTextAreaElement).value,
    ).toBe("다른 질문 미저장");
    expect(
      (screen.getByLabelText("면접관 코멘트") as HTMLTextAreaElement).value,
    ).toBe("개인 평가 미저장");
    expect(
      screen
        .getByRole("button", { name: "탐구 5점" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
  it("keeps notes after review submission and uses the submitted response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) =>
        init
          ? response({
              review: { status: "submitted", comment: "평가" },
              scores: { c1: 4 },
            })
          : response(payload),
      ),
    );
    render(<InterviewClient applicantId="a1" />);
    await screen.findByLabelText("질문 하나");
    fireEvent.change(screen.getByLabelText("질문 하나"), {
      target: { value: "미저장 메모" },
    });
    fireEvent.click(screen.getByRole("button", { name: "탐구 4점" }));
    fireEvent.click(screen.getByRole("button", { name: "평가 제출" }));
    await screen.findByRole("button", { name: "평가 수정 저장" });
    expect(
      (screen.getByLabelText("질문 하나") as HTMLTextAreaElement).value,
    ).toBe("미저장 메모");
    expect(screen.queryByRole("button", { name: "임시 저장" })).toBeNull();
  });
  it("retains local note on conflict and sends the acknowledged version on retry", async () => {
    let attempt = 0;
    const fetchMock = vi.fn((_url, init) => {
      if (!init) return response(payload);
      attempt++;
      return attempt === 1
        ? response(
            {
              error: "충돌",
              note: {
                question_id: "q1",
                note: "다른 면접관의 메모",
                version: 2,
              },
            },
            409,
          )
        : response({
            note: { question_id: "q1", note: "내 메모", version: 3 },
          });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<InterviewClient applicantId="a1" />);
    const note = await screen.findByLabelText("질문 하나");
    fireEvent.change(note, { target: { value: "내 메모" } });
    fireEvent.click(screen.getAllByRole("button", { name: "메모 저장" })[0]);
    await screen.findByText("다른 면접관의 메모");
    expect((note as HTMLTextAreaElement).value).toBe("내 메모");
    fireEvent.click(
      screen.getByRole("button", {
        name: "최신 내용 확인 완료 · 내 입력 유지",
      }),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "메모 저장" })[0]);
    await waitFor(() => expect(attempt).toBe(2));
    expect(JSON.parse(fetchMock.mock.calls.at(-1)?.[1].body).version).toBe(2);
  });
  it("keeps entered data after a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) =>
        init ? Promise.reject(new Error("오프라인")) : response(payload),
      ),
    );
    render(<InterviewClient applicantId="a1" />);
    const note = await screen.findByLabelText("질문 하나");
    fireEvent.change(note, { target: { value: "보존할 메모" } });
    fireEvent.click(screen.getAllByRole("button", { name: "메모 저장" })[0]);
    await screen.findByText("오프라인");
    expect((note as HTMLTextAreaElement).value).toBe("보존할 메모");
  });
});
