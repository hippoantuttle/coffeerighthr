import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { weightedReviewAverages } from "@/lib/reviews/aggregate";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const reviewerId = url.searchParams.get("reviewerId");
    const recruitmentId = url.searchParams.get("recruitmentId") ?? process.env.NEXT_PUBLIC_RECRUITMENT_ID;
    if (!reviewerId || !recruitmentId) return NextResponse.json({ error: "평가자 또는 모집 정보가 없습니다." }, { status: 400 });
    const s = createServerSupabase();
    const [{ data: recruitment, error: recErr }, { data: apps, error: appErr }, { data: criteria, error: criteriaErr }] = await Promise.all([
      s.from("recruitments").select("minimum_document_reviews,document_target_count").eq("id", recruitmentId).single(),
      s.from("applicants").select("id,applicant_code,name,major,interests,document_status").eq("recruitment_id", recruitmentId).order("applicant_code"),
      s.from("evaluation_criteria").select("id,weight").eq("recruitment_id", recruitmentId).eq("stage","document").eq("is_active",true),
    ]);
    if (recErr) throw recErr;
    if (appErr) throw appErr;
    if (criteriaErr) throw criteriaErr;

    const rows = [];
    for (const a of apps ?? []) {
      const { data: reviews, error: reviewErr } = await s.from("document_reviews").select("id,status,reviewer_id").eq("applicant_id", a.id);
      if (reviewErr) throw reviewErr;
      const allReviews = reviews ?? [];
      const myReview = allReviews.find(r => r.reviewer_id === reviewerId) ?? null;
      const submitted = allReviews.filter(r => r.status === "submitted");
      let average: number | null = null;
      let min: number | null = null;
      let max: number | null = null;

      if (myReview?.status === "submitted" && submitted.length) {
        const ids = submitted.map(r => r.id);
        const { data: scores, error: scoreErr } = await s.from("document_review_scores").select("score,review_id,criterion_id").in("review_id", ids);
        if (scoreErr) throw scoreErr;
        if (scores?.length) {
          const reviewAverages = weightedReviewAverages(scores, (criteria ?? []).map(c => ({ id:c.id, weight:Number(c.weight) }))).map(x => x.average);
          if (reviewAverages.length) {
            average = reviewAverages.reduce((a,b)=>a+b,0)/reviewAverages.length;
            min = Math.min(...reviewAverages);
            max = Math.max(...reviewAverages);
          }
        }
      }

      const minimum = Number(recruitment?.minimum_document_reviews ?? 3);
      rows.push({
        ...a,
        my_review_status: myReview?.status ?? null,
        review_count: submitted.length,
        minimum_review_count: minimum,
        review_shortage: submitted.length < minimum,
        document_average: average,
        document_min: min,
        document_max: max,
        high_variance: min != null && max != null ? max - min >= 2 : false,
      });
    }
    return NextResponse.json({ rows, minimumDocumentReviews: Number(recruitment?.minimum_document_reviews ?? 3), documentTargetCount: recruitment?.document_target_count ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "지원자 집계 조회 실패" }, { status: 500 });
  }
}
