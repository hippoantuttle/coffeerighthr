import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { interviewAggregate } from "@/lib/reviews/interview";
import { apiError } from "@/lib/server/error";
export async function GET(req: Request) {
  try {
    const url = new URL(req.url),
      reviewerId = url.searchParams.get("reviewerId"),
      recruitmentId =
        url.searchParams.get("recruitmentId") ||
        process.env.NEXT_PUBLIC_RECRUITMENT_ID;
    if (!reviewerId || !recruitmentId)
      return NextResponse.json(
        { error: "평가자 또는 모집 정보가 없습니다." },
        { status: 400 },
      );
    const s = createServerSupabase();
    const [{ data: recruitment }, { data: apps }, { data: criteria }] =
      await Promise.all([
        s
          .from("recruitments")
          .select("minimum_document_reviews,document_target_count")
          .eq("id", recruitmentId)
          .single()
          .throwOnError(),
        s
          .from("applicants")
          .select("id,applicant_code,name,major,interests,document_status")
          .eq("recruitment_id", recruitmentId)
          .order("applicant_code")
          .throwOnError(),
        s
          .from("evaluation_criteria")
          .select("id,weight")
          .eq("recruitment_id", recruitmentId)
          .eq("stage", "document")
          .eq("is_active", true)
          .throwOnError(),
      ]);
    const ids = (apps ?? []).map((a) => a.id);
    const { data: reviews } = ids.length
      ? await s
          .from("document_reviews")
          .select("id,applicant_id,status,reviewer_id")
          .in("applicant_id", ids)
          .throwOnError()
      : { data: [] };
    const revealed = new Set(
      (reviews ?? [])
        .filter((r) => r.reviewer_id === reviewerId && r.status === "submitted")
        .map((r) => r.applicant_id),
    );
    const submitted = (reviews ?? []).filter(
      (r) => r.status === "submitted" && revealed.has(r.applicant_id),
    );
    const { data: scores } = submitted.length
      ? await s
          .from("document_review_scores")
          .select("review_id,criterion_id,score")
          .in(
            "review_id",
            submitted.map((r) => r.id),
          )
          .throwOnError()
      : { data: [] };
    const minimum = Number(recruitment?.minimum_document_reviews ?? 12);
    const rows = (apps ?? []).map((a) => {
      const own = (reviews ?? []).find(
        (r) => r.applicant_id === a.id && r.reviewer_id === reviewerId,
      );
      const appReviews = (reviews ?? []).filter(
        (r) => r.applicant_id === a.id && r.status === "submitted",
      );
      const reviewIds = new Set(appReviews.map((r) => r.id));
      const aggregate = revealed.has(a.id)
        ? interviewAggregate(
            (scores ?? []).filter((sc) => reviewIds.has(sc.review_id)),
            (criteria ?? []).map((c) => ({
              id: c.id,
              weight: Number(c.weight),
            })),
          )
        : null;
      return {
        ...a,
        my_review_status: own?.status ?? null,
        review_count: appReviews.length,
        minimum_review_count: minimum,
        review_shortage: appReviews.length < minimum,
        document_average: aggregate?.average ?? null,
        document_min: aggregate?.min ?? null,
        document_max: aggregate?.max ?? null,
        high_variance: aggregate?.highVariance ?? false,
      };
    });
    return NextResponse.json({
      rows,
      minimumDocumentReviews: minimum,
      documentTargetCount: recruitment?.document_target_count ?? null,
    });
  } catch (error) {
    return apiError(error, "지원자 집계 조회 실패");
  }
}
