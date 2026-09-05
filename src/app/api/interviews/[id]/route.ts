import { z } from "zod";
import { reviewInput } from "@/lib/reviews/validation";
import { apiError } from "@/lib/server/error";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { interviewAggregate } from "@/lib/reviews/interview";

type Context = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Context) {
  try {
    const { id } = await params;
    const reviewerId = new URL(req.url).searchParams.get("reviewerId");
    if (!reviewerId)
      return NextResponse.json(
        { error: "평가자 정보가 없습니다." },
        { status: 400 },
      );
    const s = createServerSupabase();
    const { data: applicant, error: applicantError } = await s
      .from("applicants")
      .select(
        "id,applicant_code,name,major,grade,interview_availability,recruitment_id,document_status",
      )
      .eq("id", id)
      .single();
    if (applicantError) throw applicantError;
    if (applicant.document_status !== "interview")
      return NextResponse.json(
        { error: "면접 대상자가 아닙니다." },
        { status: 409 },
      );
    const [
      { data: answers },
      { data: criteria },
      { data: questions },
      { data: assignment },
      { data: notes },
      { data: artifact },
      { data: reviews },
    ] = await Promise.all([
      s
        .from("application_answers")
        .select("question_label,answer,sort_order")
        .eq("applicant_id", id)
        .order("sort_order")
        .throwOnError(),
      s
        .from("evaluation_criteria")
        .select("id,title,description,weight,sort_order")
        .eq("recruitment_id", applicant.recruitment_id)
        .eq("stage", "interview")
        .eq("is_active", true)
        .order("sort_order")
        .throwOnError(),
      s
        .from("interview_questions")
        .select("id,question,description,sort_order")
        .eq("recruitment_id", applicant.recruitment_id)
        .eq("is_active", true)
        .order("sort_order")
        .throwOnError(),
      s
        .from("interview_assignments")
        .select("scheduled_at,duration_minutes,interviewer_names,room,mode")
        .eq("applicant_id", id)
        .maybeSingle()
        .throwOnError(),
      s
        .from("interview_notes")
        .select("question_id,note,updated_by_name,updated_at,version")
        .eq("applicant_id", id)
        .throwOnError(),
      s
        .from("hermes_artifacts")
        .select(
          "application_summary,recommended_questions,source_version,imported_at",
        )
        .eq("applicant_id", id)
        .maybeSingle()
        .throwOnError(),
      s
        .from("interview_reviews")
        .select("id,reviewer_id,reviewer_name,comment,status,submitted_at")
        .eq("applicant_id", id),
    ]);
    const submitted = (reviews ?? []).filter((r) => r.status === "submitted");
    const allReviewIds = (reviews ?? []).map((r) => r.id);
    const submittedIds = new Set(submitted.map((r) => r.id));
    const { data: scores } = allReviewIds.length
      ? await s
          .from("interview_review_scores")
          .select("review_id,criterion_id,score")
          .in("review_id", allReviewIds)
          .throwOnError()
      : { data: [] };
    const aggregate = interviewAggregate(
      (scores ?? []).filter((row) => submittedIds.has(row.review_id)),
      (criteria ?? []).map((c) => ({ id: c.id, weight: Number(c.weight) })),
    );
    const mine =
      (reviews ?? []).find((r) => r.reviewer_id === reviewerId) ?? null;
    const myScores = mine
      ? (scores ?? []).filter((row) => row.review_id === mine.id)
      : [];
    return NextResponse.json({
      applicant,
      answers: answers ?? [],
      criteria: criteria ?? [],
      questions: questions ?? [],
      assignment,
      notes: notes ?? [],
      artifact,
      aggregate,
      reviews: submitted,
      myReview: mine,
      myScores,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "면접 정보 조회 실패" },
      { status: 500 },
    );
  }
}

const identity = z.object({
  reviewerId: z.string().trim().min(1).max(200),
  reviewerName: z.string().trim().min(1).max(100),
});
export async function PATCH(req: Request, { params }: Context) {
  try {
    const { id } = await params;
    const body = await req.json();
    const s = createServerSupabase();
    if (body.action === "review") {
      const input = reviewInput.parse(body);
      const { data, error } = await s.rpc("save_review", {
        p_applicant_id: id,
        p_stage: "interview",
        p_reviewer_id: input.reviewerId,
        p_reviewer_name: input.reviewerName,
        p_status: input.status,
        p_comment: input.comment,
        p_scores: input.scores,
      });
      if (error) throw error;
      return NextResponse.json(data);
    }
    if (body.action === "note") {
      const input = identity
        .extend({
          questionId: z.string().uuid(),
          version: z.number().int().min(0),
          note: z.string().max(30000),
        })
        .parse(body);
      const { data, error } = await s.rpc("save_interview_note", {
        p_applicant_id: id,
        p_question_id: input.questionId,
        p_version: input.version,
        p_note: input.note,
        p_reviewer_id: input.reviewerId,
        p_reviewer_name: input.reviewerName,
      });
      if (error) throw error;
      return NextResponse.json(
        data.conflict
          ? {
              ...data,
              error:
                "다른 면접관이 이 메모를 수정했습니다. 최신 내용과 비교해주세요.",
            }
          : data,
        { status: data.conflict ? 409 : 200 },
      );
    }
    if (body.action === "schedule") {
      const input = identity
        .extend({
          scheduledAt: z.string().datetime().nullable(),
          durationMinutes: z.number().int().min(5).max(180),
          interviewerNames: z.array(z.string().trim().min(1).max(100)).max(30),
          room: z.string().max(1000),
          mode: z.enum(["online", "offline"]),
        })
        .parse(body);
      const { data: applicant, error: appError } = await s
        .from("applicants")
        .select("document_status")
        .eq("id", id)
        .single();
      if (appError) throw appError;
      if (applicant.document_status !== "interview")
        return NextResponse.json(
          { error: "면접 대상자가 아닙니다." },
          { status: 409 },
        );
      const { data, error } = await s
        .from("interview_assignments")
        .upsert(
          {
            applicant_id: id,
            scheduled_at: input.scheduledAt,
            duration_minutes: input.durationMinutes,
            interviewer_names: input.interviewerNames,
            room: input.room,
            mode: input.mode,
            updated_by_id: input.reviewerId,
            updated_by_name: input.reviewerName,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "applicant_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ assignment: data });
    }
    return NextResponse.json(
      { error: "지원하지 않는 작업입니다." },
      { status: 400 },
    );
  } catch (error) {
    return apiError(error, "면접 정보 저장 실패");
  }
}
