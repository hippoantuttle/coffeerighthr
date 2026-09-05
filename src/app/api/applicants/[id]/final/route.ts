import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError } from "@/lib/server/error";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = z
      .object({
        status: z.enum([
          "pending",
          "accepted",
          "waitlisted",
          "rejected",
          "hold",
        ]),
        version: z.number().int().min(0),
        reviewerId: z.string().trim().min(1).max(200),
        reviewerName: z.string().trim().min(1).max(100),
      })
      .parse(await req.json());
    const { data, error } = await createServerSupabase().rpc(
      "save_final_decision",
      {
        p_applicant_id: id,
        p_version: input.version,
        p_status: input.status,
        p_reviewer_id: input.reviewerId,
        p_reviewer_name: input.reviewerName,
      },
    );
    if (error) throw error;
    return NextResponse.json({ applicant: data });
  } catch (error) {
    return apiError(error, "최종 상태 저장 실패");
  }
}
