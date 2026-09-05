import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { importInput, prepareImport } from "@/lib/import/preview";
import { apiError } from "@/lib/server/error";
export async function POST(req: Request) {
  try {
    const input = importInput
      .extend({ snapshot: z.record(z.string().uuid(), z.string().nullable()) })
      .parse(await req.json());
    const s = createServerSupabase();
    const { data: existing, error: readError } = await s
      .from("applicants")
      .select("id,email,phone,source_hash,applicant_code")
      .eq("recruitment_id", input.recruitmentId);
    if (readError) throw readError;
    const prepared = await prepareImport(input, existing ?? []);
    if (prepared.summary.invalid)
      return NextResponse.json(
        {
          error: "오류 행을 수정한 뒤 다시 비교해주세요.",
          rows: prepared.rows,
        },
        { status: 400 },
      );
    const { data, error } = await s.rpc("commit_applicant_import", {
      p_recruitment_id: input.recruitmentId,
      p_snapshot: input.snapshot,
      p_rows: prepared.payload,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, summary: data });
  } catch (error) {
    return apiError(error, "지원서 저장 실패");
  }
}
