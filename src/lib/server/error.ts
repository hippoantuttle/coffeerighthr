import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function apiError(error: unknown, fallback: string) {
  const value = error as { code?: string; message?: string };
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: "입력값을 확인해주세요.", issues: error.issues },
      { status: 400 },
    );
  const status =
    value?.code === "40001" || value?.code === "23505"
      ? 409
      : value?.code === "22023"
        ? 400
        : 500;
  console.error(fallback, { code: value?.code, message: value?.message });
  const message =
    status === 409
      ? "다른 변경이 먼저 저장되었습니다. 최신 내용을 확인한 뒤 다시 시도해주세요."
      : status === 400
        ? value.message
        : `${fallback}. 잠시 후 다시 시도해주세요.`;
  return NextResponse.json({ error: message }, { status });
}
