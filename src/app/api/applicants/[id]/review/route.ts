import { reviewInput } from "@/lib/reviews/validation";
import { apiError } from "@/lib/server/error";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { weightedReviewAverages } from "@/lib/reviews/aggregate";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const reviewerId = new URL(req.url).searchParams.get("reviewerId");
    if (!reviewerId)
      return NextResponse.json({
        review: null,
        scores: [],
        aggregate: null,
        peerReviews: [],
      });
    const s = createServerSupabase();
    const { data: review, error: reviewError } = await s
      .from("document_reviews")
      .select("id,status,comment")
      .eq("applicant_id", id)
      .eq("reviewer_id", reviewerId)
      .maybeSingle();
    if (reviewError) throw reviewError;
    if (!review)
      return NextResponse.json({
        review: null,
        scores: [],
        aggregate: null,
        peerReviews: [],
      });
    const { data: scores, error: scoreError } = await s
      .from("document_review_scores")
      .select("criterion_id,score")
      .eq("review_id", review.id);
    if (scoreError) throw scoreError;

    // Before the reviewer submits, never return peer scores/comments or aggregate scores.
    if (review.status !== "submitted")
      return NextResponse.json({
        review,
        scores: scores ?? [],
        aggregate: null,
        peerReviews: [],
      });

    const { data: applicant, error: appError } = await s
      .from("applicants")
      .select("recruitment_id")
      .eq("id", id)
      .single();
    if (appError) throw appError;
    const [
      { data: criteria, error: criteriaError },
      { data: peer, error: peerError },
    ] = await Promise.all([
      s
        .from("evaluation_criteria")
        .select("id,weight")
        .eq("recruitment_id", applicant.recruitment_id)
        .eq("stage", "document")
        .eq("is_active", true),
      s
        .from("document_reviews")
        .select("id,reviewer_id,reviewer_name,comment,status,submitted_at")
        .eq("applicant_id", id)
        .eq("status", "submitted"),
    ]);
    if (criteriaError) throw criteriaError;
    if (peerError) throw peerError;
    const peerIds = (peer ?? []).map((x) => x.id);
    const { data: peerScores, error: peerScoreError } = peerIds.length
      ? await s
          .from("document_review_scores")
          .select("review_id,criterion_id,score")
          .in("review_id", peerIds)
      : { data: [], error: null };
    if (peerScoreError) throw peerScoreError;
    const avgs = weightedReviewAverages(
      peerScores ?? [],
      (criteria ?? []).map((c) => ({ id: c.id, weight: Number(c.weight) })),
    );
    const avgMap = new Map(avgs.map((x) => [x.reviewId, x.average]));
    const values = avgs.map((x) => x.average);
    const aggregate = values.length
      ? {
          average: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          count: values.length,
          highVariance: Math.max(...values) - Math.min(...values) >= 2,
        }
      : null;
    const peerReviews = (peer ?? []).map((x) => ({
      reviewerName: x.reviewer_name,
      comment: x.comment,
      average: avgMap.get(x.id) ?? null,
      submittedAt: x.submitted_at,
    }));
    return NextResponse.json({
      review,
      scores: scores ?? [],
      aggregate,
      peerReviews,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "조회 실패" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = reviewInput.parse(await req.json());
    const { data, error } = await createServerSupabase().rpc("save_review", {
      p_applicant_id: id,
      p_stage: "document",
      p_reviewer_id: input.reviewerId,
      p_reviewer_name: input.reviewerName,
      p_status: input.status,
      p_comment: input.comment,
      p_scores: input.scores,
    });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return apiError(error, "서류 평가 저장 실패");
  }
}
