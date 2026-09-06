import { NextResponse } from "next/server";
import JSZip from "jszip";
import { createServerSupabase } from "@/lib/supabase/server";
import { toCsv } from "@/lib/archive/csv";
import { chunk } from "@/lib/arrays/chunk";

type Context = { params: Promise<{ type: string }> };
export async function POST(req: Request, { params }: Context) {
  try {
    const { type } = await params;
    if (type !== "interview_final" && type !== "full_final")
      return NextResponse.json(
        { error: "지원하지 않는 아카이브 유형입니다." },
        { status: 404 },
      );
    const body = await req.json().catch(() => ({}));
    const recruitmentId =
      body.recruitmentId ?? process.env.NEXT_PUBLIC_RECRUITMENT_ID;
    if (!recruitmentId)
      return NextResponse.json(
        { error: "모집 정보가 없습니다." },
        { status: 400 },
      );
    const includePersonalData = Boolean(body.includePersonalData);
    const s = createServerSupabase();
    const [
      { data: recruitment, error: recError },
      { data: applicants, error: appError },
      { data: criteria, error: criteriaError },
      { data: questions, error: questionError },
    ] = await Promise.all([
      s.from("recruitments").select("*").eq("id", recruitmentId).single(),
      s
        .from("applicants")
        .select("*")
        .eq("recruitment_id", recruitmentId)
        .order("applicant_code"),
      s
        .from("evaluation_criteria")
        .select("*")
        .eq("recruitment_id", recruitmentId)
        .order("stage")
        .order("sort_order"),
      s
        .from("interview_questions")
        .select("*")
        .eq("recruitment_id", recruitmentId)
        .order("sort_order"),
    ]);
    if (recError) throw recError;
    if (appError) throw appError;
    if (criteriaError) throw criteriaError;
    if (questionError) throw questionError;
    const applicantIds = (applicants ?? []).map((a) => a.id);
    const codeById = new Map(
      (applicants ?? []).map((a) => [a.id, a.applicant_code]),
    );
    const [
      { data: assignments },
      { data: notes },
      { data: reviews },
      { data: artifacts },
      { data: answers },
    ] = await Promise.all([
      applicantIds.length
        ? s
            .from("interview_assignments")
            .select("*")
            .in("applicant_id", applicantIds)
            .throwOnError()
        : Promise.resolve({ data: [] }),
      applicantIds.length
        ? s
            .from("interview_notes")
            .select("*")
            .in("applicant_id", applicantIds)
            .throwOnError()
        : Promise.resolve({ data: [] }),
      applicantIds.length
        ? s
            .from("interview_reviews")
            .select("*")
            .in("applicant_id", applicantIds)
            .throwOnError()
        : Promise.resolve({ data: [] }),
      applicantIds.length
        ? s
            .from("hermes_artifacts")
            .select("*")
            .in("applicant_id", applicantIds)
            .throwOnError()
        : Promise.resolve({ data: [] }),
      applicantIds.length
        ? s
            .from("application_answers")
            .select("*")
            .in("applicant_id", applicantIds)
            .throwOnError()
        : Promise.resolve({ data: [] }),
    ]);
    const scoreResponses = await Promise.all(
      chunk(
        (reviews ?? []).map((r) => r.id),
        100,
      ).map((reviewIds) =>
        s
          .from("interview_review_scores")
          .select("*")
          .in("review_id", reviewIds)
          .throwOnError(),
      ),
    );
    const scores = scoreResponses.flatMap((response) => response.data ?? []);
    const zip = new JSZip();
    const files: string[] = [];
    const add = (
      name: string,
      headers: string[],
      rows: Record<string, unknown>[],
    ) => {
      zip.file(name, "\ufeff" + toCsv(headers, rows));
      files.push(name);
    };
    const applicantHeaders = [
      "applicant_code",
      "document_status",
      "final_status",
      "interview_availability",
    ];
    if (includePersonalData)
      applicantHeaders.splice(
        1,
        0,
        "name",
        "email",
        "phone",
        "major",
        "student_number",
        "grade",
        "gender",
        "birth_date",
      );
    add(
      "applicants.csv",
      applicantHeaders,
      (applicants ?? []).map((a) =>
        Object.fromEntries(applicantHeaders.map((key) => [key, a[key]])),
      ),
    );
    add(
      "application_answers.csv",
      [
        "applicant_code",
        "question_key",
        "question_label",
        "answer",
        "sort_order",
      ],
      (answers ?? []).map((a) => ({
        ...a,
        applicant_code: codeById.get(a.applicant_id),
      })),
    );
    add(
      "interview_assignments.csv",
      [
        "applicant_code",
        "scheduled_at",
        "duration_minutes",
        "interviewer_names",
        "room",
        "mode",
        "updated_by_name",
        "updated_at",
      ],
      (assignments ?? []).map((a) => ({
        ...a,
        applicant_code: codeById.get(a.applicant_id),
      })),
    );
    add(
      "interview_questions.csv",
      ["id", "question", "description", "sort_order", "is_active"],
      questions ?? [],
    );
    add(
      "interview_notes.csv",
      [
        "applicant_code",
        "question_id",
        "note",
        "updated_by_name",
        "updated_at",
      ],
      (notes ?? []).map((n) => ({
        ...n,
        applicant_code: codeById.get(n.applicant_id),
      })),
    );
    add(
      "interview_reviews.csv",
      [
        "applicant_code",
        "reviewer_name",
        "comment",
        "status",
        "submitted_at",
        "updated_at",
      ],
      (reviews ?? []).map((r) => ({
        ...r,
        applicant_code: codeById.get(r.applicant_id),
      })),
    );
    const reviewById = new Map((reviews ?? []).map((r) => [r.id, r]));
    const criterionById = new Map((criteria ?? []).map((c) => [c.id, c.title]));
    add(
      "interview_review_scores.csv",
      ["applicant_code", "reviewer_name", "criterion", "score"],
      scores.map((sc) => {
        const review = reviewById.get(sc.review_id);
        return {
          applicant_code: codeById.get(review?.applicant_id),
          reviewer_name: review?.reviewer_name,
          criterion: criterionById.get(sc.criterion_id),
          score: sc.score,
        };
      }),
    );
    add(
      "hermes_artifacts.csv",
      [
        "applicant_code",
        "application_summary",
        "recommended_questions",
        "source_hash",
        "source_version",
        "imported_at",
        "updated_at",
      ],
      (artifacts ?? []).map((a) => ({
        ...a,
        applicant_code: codeById.get(a.applicant_id),
      })),
    );
    add(
      "evaluation_criteria.csv",
      ["stage", "title", "description", "weight", "sort_order", "is_active"],
      criteria ?? [],
    );
    if (type === "full_final") {
      if (includePersonalData)
        add(
          "application_source.csv",
          [
            "applicant_code",
            "consent_text",
            "application_source",
            "session_confirmation",
            "ot_mt_reason",
            "source_data",
            "extra_fields",
          ],
          applicants ?? [],
        );
      const { data: decisions } = applicantIds.length
        ? await s
            .from("final_decisions")
            .select("*")
            .in("applicant_id", applicantIds)
            .order("created_at")
            .throwOnError()
        : { data: [] };
      add(
        "final_decisions.csv",
        [
          "applicant_code",
          "previous_status",
          "status",
          "reviewer_name",
          "created_at",
        ],
        (decisions ?? []).map((d) => ({
          ...d,
          applicant_code: codeById.get(d.applicant_id),
        })),
      );

      const { data: documentReviews } = applicantIds.length
        ? await s
            .from("document_reviews")
            .select("*")
            .in("applicant_id", applicantIds)
            .throwOnError()
        : { data: [] };
      const documentScoreResponses = await Promise.all(
        chunk(
          (documentReviews ?? []).map((r) => r.id),
          100,
        ).map((reviewIds) =>
          s
            .from("document_review_scores")
            .select("*")
            .in("review_id", reviewIds)
            .throwOnError(),
        ),
      );
      const documentScores = documentScoreResponses.flatMap(
        (response) => response.data ?? [],
      );
      add(
        "document_reviews.csv",
        [
          "applicant_code",
          "reviewer_name",
          "comment",
          "status",
          "submitted_at",
          "updated_at",
        ],
        (documentReviews ?? []).map((r) => ({
          ...r,
          applicant_code: codeById.get(r.applicant_id),
        })),
      );
      const documentReviewById = new Map(
        (documentReviews ?? []).map((r) => [r.id, r]),
      );
      add(
        "document_review_scores.csv",
        ["applicant_code", "reviewer_name", "criterion", "score"],
        documentScores.map((sc) => {
          const review = documentReviewById.get(sc.review_id);
          return {
            applicant_code: codeById.get(review?.applicant_id),
            reviewer_name: review?.reviewer_name,
            criterion: criterionById.get(sc.criterion_id),
            score: sc.score,
          };
        }),
      );
    }
    const manifest = {
      schema_version: "1.1",
      archive_type: type,
      generated_at: new Date().toISOString(),
      recruitment,
      applicant_count: (applicants ?? []).length,
      contains_personal_data: includePersonalData,
      score_policy: "document_and_interview_scores_are_not_combined",
      files: [...files, "archive_metadata.json"],
    };
    zip.file("archive_metadata.json", JSON.stringify(manifest, null, 2));
    const { error: archiveError } = await s
      .from("archives")
      .insert({
        recruitment_id: recruitmentId,
        archive_type: type,
        created_by_id: body.reviewerId ?? null,
        created_by_name: body.reviewerName ?? null,
        contains_personal_data: includePersonalData,
        schema_version: "1.1",
        applicant_count: (applicants ?? []).length,
        manifest,
      });
    if (archiveError) throw archiveError;
    const buffer = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
    });
    return new Response(
      new Blob([buffer as Uint8Array<ArrayBuffer>], {
        type: "application/zip",
      }),
      {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename=coffeeright-${type}-${new Date().toISOString().slice(0, 10)}.zip`,
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "아카이브 생성 실패" },
      { status: 500 },
    );
  }
}
