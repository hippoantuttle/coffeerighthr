import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { sha256 } from "@/lib/hash/sha256";
import { apiError } from "@/lib/server/error";

type HermesRow = {
  applicant_code?: unknown;
  application_summary?: unknown;
  summary?: unknown;
  recommended_questions?: unknown;
  questions?: unknown;
  source_version?: unknown;
};

function normalizeQuestions(value: unknown): string[] {
  if (Array.isArray(value))
    return value
      .map(String)
      .map((v) => v.trim())
      .filter(Boolean);
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed))
      return parsed
        .map(String)
        .map((v) => v.trim())
        .filter(Boolean);
  } catch {}
  return trimmed
    .split(/\r?\n|\s*\|\s*/)
    .map((v) => v.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const recruitmentId =
      body.recruitmentId ?? process.env.NEXT_PUBLIC_RECRUITMENT_ID;
    if (
      !recruitmentId ||
      !Array.isArray(body.rows) ||
      !body.rows.length ||
      body.rows.length > 2000 ||
      body.rows.some(
        (r: unknown) => !r || typeof r !== "object" || Array.isArray(r),
      )
    )
      return NextResponse.json(
        { error: "모집 정보와 올바른 Hermes 행이 필요합니다." },
        { status: 400 },
      );
    const s = createServerSupabase();
    const { data: applicants, error: appError } = await s
      .from("applicants")
      .select("id,applicant_code")
      .eq("recruitment_id", recruitmentId)
      .eq("document_status", "interview");
    if (appError) throw appError;
    const byCode = new Map(
      (applicants ?? []).map((a) => [a.applicant_code.trim().toUpperCase(), a]),
    );
    const seen = new Set<string>();
    const valid: Array<{
      applicant_id: string;
      applicant_code: string;
      application_summary: string;
      recommended_questions: string[];
      source_version: string | null;
    }> = [];
    const errors: string[] = [];
    for (const [index, raw] of (body.rows as HermesRow[]).entries()) {
      const code = String(raw.applicant_code ?? "")
        .trim()
        .toUpperCase();
      const summary = String(
        raw.application_summary ?? raw.summary ?? "",
      ).trim();
      const questions = normalizeQuestions(
        raw.recommended_questions ?? raw.questions,
      );
      if (!code) {
        errors.push(`${index + 2}행: applicant_code 누락`);
        continue;
      }
      if (seen.has(code)) {
        errors.push(`${index + 2}행: ${code} 중복`);
        continue;
      }
      seen.add(code);
      const applicant = byCode.get(code);
      if (!applicant) {
        errors.push(`${index + 2}행: 면접 대상자 ${code}를 찾을 수 없음`);
        continue;
      }
      if (!summary || questions.length === 0) {
        errors.push(`${index + 2}행: 요약 또는 추천 질문 누락`);
        continue;
      }
      valid.push({
        applicant_id: applicant.id,
        applicant_code: applicant.applicant_code,
        application_summary: summary,
        recommended_questions: questions,
        source_version: raw.source_version ? String(raw.source_version) : null,
      });
    }
    const missing = [...byCode.keys()].filter((code) => !seen.has(code));
    if (body.action !== "commit")
      return NextResponse.json({
        valid,
        errors,
        missing,
        canCommit: valid.length > 0 && errors.length === 0,
      });
    if (errors.length)
      return NextResponse.json(
        { error: "검증 오류를 해결한 뒤 가져오세요.", valid, errors, missing },
        { status: 409 },
      );
    const importedAt = new Date().toISOString();
    const rows = await Promise.all(
      valid.map(async (row) => ({
        applicant_id: row.applicant_id,
        application_summary: row.application_summary,
        recommended_questions: row.recommended_questions,
        source_hash: await sha256(JSON.stringify(row)),
        source_version: row.source_version,
        imported_by_id: body.reviewerId ?? null,
        imported_by_name: body.reviewerName ?? null,
        imported_at: importedAt,
        updated_at: importedAt,
      })),
    );
    const { error } = await s
      .from("hermes_artifacts")
      .upsert(rows, { onConflict: "applicant_id" });
    if (error) throw error;
    return NextResponse.json({ imported: rows.length, missing });
  } catch (error) {
    return apiError(error, "Hermes 결과 가져오기 실패");
  }
}
