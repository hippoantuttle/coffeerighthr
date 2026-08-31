import { NextResponse } from "next/server";
import JSZip from "jszip";
import { createServerSupabase } from "@/lib/supabase/server";
import { toCsv } from "@/lib/archive/csv";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const recruitmentId = body.recruitmentId ?? process.env.NEXT_PUBLIC_RECRUITMENT_ID;
    const createdById = body.reviewerId ?? null;
    const createdByName = body.reviewerName ?? null;
    const includePersonalData = Boolean(body.includePersonalData);
    if (!recruitmentId) return NextResponse.json({ error: "모집 정보가 없습니다." }, { status: 400 });

    const s = createServerSupabase();
    const [{ data: recruitment, error: recruitmentError }, { data: applicants, error: appError }, { data: criteria, error: criteriaError }] = await Promise.all([
      s.from("recruitments").select("id,name,cohort,current_stage,minimum_document_reviews,created_at").eq("id", recruitmentId).single(),
      s.from("applicants").select("*").eq("recruitment_id", recruitmentId).order("applicant_code"),
      s.from("evaluation_criteria").select("id,stage,title,description,weight,sort_order,is_active").eq("recruitment_id", recruitmentId).order("stage").order("sort_order"),
    ]);
    if (recruitmentError) throw recruitmentError;
    if (appError) throw appError;
    if (criteriaError) throw criteriaError;

    const applicantIds = (applicants ?? []).map(a => a.id);
    const [{ data: answers, error: answerError }, { data: reviews, error: reviewError }] = await Promise.all([
      applicantIds.length ? s.from("application_answers").select("id,applicant_id,question_key,question_label,answer,sort_order").in("applicant_id", applicantIds).order("sort_order") : Promise.resolve({ data: [], error: null }),
      applicantIds.length ? s.from("document_reviews").select("id,applicant_id,reviewer_id,reviewer_name,comment,status,submitted_at,created_at,updated_at").in("applicant_id", applicantIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (answerError) throw answerError;
    if (reviewError) throw reviewError;

    const reviewIds = (reviews ?? []).map(r => r.id);
    const { data: scores, error: scoreError } = reviewIds.length
      ? await s.from("document_review_scores").select("id,review_id,criterion_id,score").in("review_id", reviewIds)
      : { data: [], error: null };
    if (scoreError) throw scoreError;

    const applicantHeaders = ["applicant_code","document_status","final_status","interests","source_submitted_at"];
    if (includePersonalData) applicantHeaders.splice(1, 0, "name","email","phone","major","student_number","grade","gender","birth_date");
    const applicantRows = (applicants ?? []).map(a => {
      const base: Record<string, unknown> = {
        applicant_code: a.applicant_code,
        document_status: a.document_status,
        final_status: a.final_status,
        interests: a.interests,
        source_submitted_at: a.source_submitted_at,
      };
      if (includePersonalData) Object.assign(base, { name:a.name,email:a.email,phone:a.phone,major:a.major,student_number:a.student_number,grade:a.grade,gender:a.gender,birth_date:a.birth_date });
      return base;
    });

    const applicantCodeById = new Map((applicants ?? []).map(a => [a.id, a.applicant_code]));
    const reviewApplicantById = new Map((reviews ?? []).map(r => [r.id, r.applicant_id]));
    const criterionTitleById = new Map((criteria ?? []).map(c => [c.id, c.title]));

    const zip = new JSZip();
    zip.file("applicants.csv", "\ufeff" + toCsv(applicantHeaders, applicantRows));
    zip.file("application_answers.csv", "\ufeff" + toCsv(["applicant_code","question_key","question_label","answer","sort_order"], (answers ?? []).map(a => ({...a, applicant_code: applicantCodeById.get(a.applicant_id)}))));
    zip.file("document_reviews.csv", "\ufeff" + toCsv(["applicant_code","reviewer_name","status","comment","submitted_at","updated_at"], (reviews ?? []).map(r => ({...r, applicant_code: applicantCodeById.get(r.applicant_id)}))));
    zip.file("document_review_scores.csv", "\ufeff" + toCsv(["applicant_code","reviewer_name","criterion","score"], (scores ?? []).map(sc => {
      const review = (reviews ?? []).find(r => r.id === sc.review_id);
      return { applicant_code: applicantCodeById.get(reviewApplicantById.get(sc.review_id)), reviewer_name: review?.reviewer_name ?? "", criterion: criterionTitleById.get(sc.criterion_id) ?? sc.criterion_id, score: sc.score };
    })));
    zip.file("evaluation_criteria.csv", "\ufeff" + toCsv(["stage","title","description","weight","sort_order","is_active"], criteria ?? []));

    const manifest = {
      schema_version: "1.0",
      archive_type: "document_final",
      generated_at: new Date().toISOString(),
      recruitment,
      applicant_count: (applicants ?? []).length,
      submitted_review_count: (reviews ?? []).filter(r => r.status === "submitted").length,
      contains_personal_data: includePersonalData,
      files: ["applicants.csv","application_answers.csv","document_reviews.csv","document_review_scores.csv","evaluation_criteria.csv","archive_metadata.json"],
    };
    zip.file("archive_metadata.json", JSON.stringify(manifest, null, 2));

    const buffer = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const { error: archiveError } = await s.from("archives").insert({
      recruitment_id: recruitmentId,
      archive_type: "document_final",
      created_by_id: createdById,
      created_by_name: createdByName,
      contains_personal_data: includePersonalData,
      schema_version: "1.0",
      applicant_count: (applicants ?? []).length,
      manifest,
    });
    if (archiveError) throw archiveError;

    const safeCohort = String(recruitment?.cohort ?? "recruitment").replace(/[^0-9A-Za-z가-힣_-]/g, "_");
    const stamp = new Date().toISOString().slice(0,10);
    return new Response(new Blob([buffer as Uint8Array<ArrayBuffer>], { type: "application/zip" }), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=coffeeright-${encodeURIComponent(safeCohort)}-document-final-${stamp}.zip`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "아카이브 생성 실패" }, { status: 500 });
  }
}
