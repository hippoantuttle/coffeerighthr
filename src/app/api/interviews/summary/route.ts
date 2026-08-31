import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { interviewAggregate } from "@/lib/reviews/interview";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const recruitmentId = url.searchParams.get("recruitmentId") ?? process.env.NEXT_PUBLIC_RECRUITMENT_ID;
    if (!recruitmentId) return NextResponse.json({ error:"모집 정보가 없습니다." }, { status:400 });
    const s = createServerSupabase();
    const [{ data: recruitment, error: recError }, { data: applicants, error: appError }, { data: criteria, error: criteriaError }] = await Promise.all([
      s.from("recruitments").select("minimum_interview_reviews").eq("id", recruitmentId).single(),
      s.from("applicants").select("id,applicant_code,name,major,interview_availability,final_status").eq("recruitment_id", recruitmentId).eq("document_status", "interview").order("applicant_code"),
      s.from("evaluation_criteria").select("id,weight").eq("recruitment_id", recruitmentId).eq("stage", "interview").eq("is_active", true),
    ]);
    if (recError) throw recError;
    if (appError) throw appError;
    if (criteriaError) throw criteriaError;
    const ids = (applicants ?? []).map(a => a.id);
    const [{ data: assignments, error: assignmentError }, { data: reviews, error: reviewError }, { data: artifacts, error: artifactError }] = await Promise.all([
      ids.length ? s.from("interview_assignments").select("applicant_id,scheduled_at,duration_minutes,interviewer_names,room,mode").in("applicant_id", ids) : Promise.resolve({ data:[], error:null }),
      ids.length ? s.from("interview_reviews").select("id,applicant_id,status").in("applicant_id", ids) : Promise.resolve({ data:[], error:null }),
      ids.length ? s.from("hermes_artifacts").select("applicant_id").in("applicant_id", ids) : Promise.resolve({ data:[], error:null }),
    ]);
    if (assignmentError) throw assignmentError;
    if (reviewError) throw reviewError;
    if (artifactError) throw artifactError;
    const submitted = (reviews ?? []).filter(r => r.status === "submitted");
    const reviewIds = submitted.map(r => r.id);
    const { data: scores, error: scoreError } = reviewIds.length
      ? await s.from("interview_review_scores").select("review_id,criterion_id,score").in("review_id", reviewIds)
      : { data:[], error:null };
    if (scoreError) throw scoreError;
    const minimum = Number(recruitment?.minimum_interview_reviews ?? 2);
    const rows = (applicants ?? []).map(applicant => {
      const appReviews = submitted.filter(r => r.applicant_id === applicant.id);
      const appReviewIds = new Set(appReviews.map(r => r.id));
      const aggregate = interviewAggregate((scores ?? []).filter(row => appReviewIds.has(row.review_id)), (criteria ?? []).map(c => ({ id:c.id, weight:Number(c.weight) })));
      return {
        ...applicant,
        assignment:(assignments ?? []).find(a => a.applicant_id === applicant.id) ?? null,
        hermes_ready:(artifacts ?? []).some(a => a.applicant_id === applicant.id),
        review_count:appReviews.length,
        minimum_review_count:minimum,
        review_shortage:appReviews.length < minimum,
        interview_average:aggregate?.average ?? null,
        interview_min:aggregate?.min ?? null,
        interview_max:aggregate?.max ?? null,
        high_variance:aggregate?.highVariance ?? false,
      };
    });
    return NextResponse.json({ rows, minimumInterviewReviews:minimum });
  } catch (error) {
    return NextResponse.json({ error:error instanceof Error ? error.message : "면접 현황 조회 실패" }, { status:500 });
  }
}
