import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { importInput, prepareImport } from "@/lib/import/preview";
import { apiError } from "@/lib/server/error";
export async function POST(req: Request) {
  try {
    const input = importInput.parse(await req.json());
    const { data, error } = await createServerSupabase()
      .from("applicants")
      .select("id,email,phone,source_hash,applicant_code")
      .eq("recruitment_id", input.recruitmentId);
    if (error) throw error;
    const { payload, ...preview } = await prepareImport(input, data ?? []);
    void payload;
    return NextResponse.json(preview);
  } catch (error) {
    return apiError(error, "가져오기 비교 실패");
  }
}
