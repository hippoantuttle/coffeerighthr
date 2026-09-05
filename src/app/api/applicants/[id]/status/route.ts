import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({
  status: z.enum(["pending", "reviewing", "hold", "interview", "rejected"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = bodySchema.parse(await req.json());
    const s = createServerSupabase();
    const { data, error } = await s
      .from("applicants")
      .update({
        document_status: body.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id,document_status")
      .single();
    if (error) throw error;
    return NextResponse.json({ applicant: data });
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json(
        { error: "올바르지 않은 상태입니다." },
        { status: 400 },
      );
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "상태 변경 실패" },
      { status: 500 },
    );
  }
}
