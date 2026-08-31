import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { interviewAggregate } from "@/lib/reviews/interview";

type Context = { params:Promise<{ id:string }> };

export async function GET(req: Request, { params }: Context) {
  try {
    const { id } = await params;
    const reviewerId = new URL(req.url).searchParams.get("reviewerId");
    if (!reviewerId) return NextResponse.json({ error:"평가자 정보가 없습니다." }, { status:400 });
    const s = createServerSupabase();
    const { data: applicant, error: applicantError } = await s.from("applicants").select("id,applicant_code,name,major,grade,interview_availability,recruitment_id,document_status").eq("id", id).single();
    if (applicantError) throw applicantError;
    if (applicant.document_status !== "interview") return NextResponse.json({ error:"면접 대상자가 아닙니다." }, { status:409 });
    const [{ data: answers }, { data: criteria }, { data: questions }, { data: assignment }, { data: notes }, { data: artifact }, { data: reviews }] = await Promise.all([
      s.from("application_answers").select("question_label,answer,sort_order").eq("applicant_id", id).order("sort_order"),
      s.from("evaluation_criteria").select("id,title,description,weight,sort_order").eq("recruitment_id", applicant.recruitment_id).eq("stage", "interview").eq("is_active", true).order("sort_order"),
      s.from("interview_questions").select("id,question,description,sort_order").eq("recruitment_id", applicant.recruitment_id).eq("is_active", true).order("sort_order"),
      s.from("interview_assignments").select("scheduled_at,duration_minutes,interviewer_names,room,mode").eq("applicant_id", id).maybeSingle(),
      s.from("interview_notes").select("question_id,note,updated_by_name,updated_at").eq("applicant_id", id),
      s.from("hermes_artifacts").select("application_summary,recommended_questions,source_version,imported_at").eq("applicant_id", id).maybeSingle(),
      s.from("interview_reviews").select("id,reviewer_id,reviewer_name,comment,status,submitted_at").eq("applicant_id", id),
    ]);
    const submitted = (reviews ?? []).filter(r => r.status === "submitted");
    const allReviewIds = (reviews ?? []).map(r => r.id);
    const submittedIds = new Set(submitted.map(r => r.id));
    const { data:scores } = allReviewIds.length ? await s.from("interview_review_scores").select("review_id,criterion_id,score").in("review_id", allReviewIds) : { data:[] };
    const aggregate = interviewAggregate((scores ?? []).filter(row => submittedIds.has(row.review_id)), (criteria ?? []).map(c => ({ id:c.id, weight:Number(c.weight) })));
    const mine = (reviews ?? []).find(r => r.reviewer_id === reviewerId) ?? null;
    const myScores = mine ? (scores ?? []).filter(row => row.review_id === mine.id) : [];
    return NextResponse.json({ applicant, answers:answers ?? [], criteria:criteria ?? [], questions:questions ?? [], assignment, notes:notes ?? [], artifact, aggregate, reviews:submitted, myReview:mine, myScores });
  } catch (error) {
    return NextResponse.json({ error:error instanceof Error ? error.message : "면접 정보 조회 실패" }, { status:500 });
  }
}

export async function PATCH(req: Request, { params }: Context) {
  try {
    const { id } = await params;
    const body = await req.json();
    const s = createServerSupabase();
    if (body.action === "schedule") {
      if (!body.reviewerId || !body.reviewerName) return NextResponse.json({ error:"평가자 정보가 없습니다." }, { status:400 });
      const payload = {
        applicant_id:id,
        scheduled_at:body.scheduledAt || null,
        duration_minutes:Number(body.durationMinutes ?? 20),
        interviewer_names:Array.isArray(body.interviewerNames) ? body.interviewerNames : [],
        room:body.room || null,
        mode:body.mode === "online" ? "online" : "offline",
        updated_by_id:body.reviewerId,
        updated_by_name:body.reviewerName,
        updated_at:new Date().toISOString(),
      };
      const { error } = await s.from("interview_assignments").upsert(payload, { onConflict:"applicant_id" });
      if (error) throw error;
      return NextResponse.json({ ok:true });
    }
    if (body.action === "note") {
      if (!body.questionId || !body.reviewerId || !body.reviewerName) return NextResponse.json({ error:"메모 저장 정보가 부족합니다." }, { status:400 });
      const { error } = await s.from("interview_notes").upsert({ applicant_id:id, question_id:body.questionId, note:String(body.note ?? ""), updated_by_id:body.reviewerId, updated_by_name:body.reviewerName, updated_at:new Date().toISOString() }, { onConflict:"applicant_id,question_id" });
      if (error) throw error;
      return NextResponse.json({ ok:true });
    }
    if (body.action === "review") {
      const status = body.status === "submitted" ? "submitted" : "draft";
      if (!body.reviewerId || !body.reviewerName) return NextResponse.json({ error:"평가자 정보가 없습니다." }, { status:400 });
      const { data: applicant } = await s.from("applicants").select("recruitment_id").eq("id", id).single();
      const { data: criteria } = await s.from("evaluation_criteria").select("id").eq("recruitment_id", applicant?.recruitment_id).eq("stage", "interview").eq("is_active", true);
      const scoreMap = body.scores && typeof body.scores === "object" ? body.scores as Record<string,number> : {};
      if (status === "submitted" && (criteria ?? []).some(c => !Number.isInteger(scoreMap[c.id]) || scoreMap[c.id] < 1 || scoreMap[c.id] > 5)) return NextResponse.json({ error:"모든 면접 평가 항목에 1~5점 점수를 입력해주세요." }, { status:400 });
      const { data: review, error: reviewError } = await s.from("interview_reviews").upsert({ applicant_id:id, reviewer_id:body.reviewerId, reviewer_name:body.reviewerName, comment:String(body.comment ?? ""), status, submitted_at:status === "submitted" ? new Date().toISOString() : null, updated_at:new Date().toISOString() }, { onConflict:"applicant_id,reviewer_id" }).select("id,status").single();
      if (reviewError) throw reviewError;
      const scoreRows = Object.entries(scoreMap).filter(([,score]) => Number.isInteger(score) && score >= 1 && score <= 5).map(([criterion_id,score]) => ({ review_id:review.id, criterion_id, score }));
      if (scoreRows.length) {
        const { error:scoreError } = await s.from("interview_review_scores").upsert(scoreRows, { onConflict:"review_id,criterion_id" });
        if (scoreError) throw scoreError;
      }
      return NextResponse.json({ ok:true, status:review.status });
    }
    return NextResponse.json({ error:"지원하지 않는 작업입니다." }, { status:400 });
  } catch (error) {
    return NextResponse.json({ error:error instanceof Error ? error.message : "면접 정보 저장 실패" }, { status:500 });
  }
}
