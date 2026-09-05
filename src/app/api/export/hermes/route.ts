import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError } from "@/lib/server/error";
import { toCsv } from "@/lib/archive/csv";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url),
      id =
        url.searchParams.get("recruitmentId") ||
        process.env.NEXT_PUBLIC_RECRUITMENT_ID;
    if (!id)
      return NextResponse.json(
        { error: "모집 정보가 없습니다." },
        { status: 400 },
      );
    const s = createServerSupabase();
    const { data: apps } = await s
      .from("applicants")
      .select("id,applicant_code")
      .eq("recruitment_id", id)
      .eq("document_status", "interview")
      .order("applicant_code")
      .throwOnError();
    const ids = (apps ?? []).map((a) => a.id);
    const { data: answers } = ids.length
      ? await s
          .from("application_answers")
          .select("applicant_id,question_label,answer,sort_order")
          .in("applicant_id", ids)
          .order("sort_order")
          .throwOnError()
      : { data: [] };
    const rows = (apps ?? []).map((a) => ({
      applicant_code: a.applicant_code,
      application_answers: (answers ?? [])
        .filter((x) => x.applicant_id === a.id)
        .map((x) => ({ question: x.question_label, answer: x.answer })),
    }));
    const csv = url.searchParams.get("format") === "csv";
    return new Response(
      csv
        ? "\ufeff" + toCsv(["applicant_code", "application_answers"], rows)
        : JSON.stringify(rows, null, 2),
      {
        headers: {
          "Content-Type": csv
            ? "text/csv; charset=utf-8"
            : "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename=coffeeright-hermes-input.${csv ? "csv" : "json"}`,
        },
      },
    );
  } catch (error) {
    return apiError(error, "Hermes 입력 내보내기 실패");
  }
}
