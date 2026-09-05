import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import ReviewClient from "./ReviewClient";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = createServerSupabase();
  const { data: a } = await s
    .from("applicants")
    .select(
      "id,applicant_code,name,major,student_number,grade,gender,birth_date,email,phone,interests,recruitment_id",
    )
    .eq("id", id)
    .single();
  if (!a) notFound();
  const [{ data: answers }, { data: criteria }] = await Promise.all([
    s
      .from("application_answers")
      .select("question_label,answer,sort_order")
      .eq("applicant_id", id)
      .order("sort_order")
      .throwOnError(),
    s
      .from("evaluation_criteria")
      .select("id,title,description,weight,sort_order")
      .eq("recruitment_id", a.recruitment_id)
      .eq("stage", "document")
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  const { data: siblings } = await s
    .from("applicants")
    .select("id,applicant_code")
    .eq("recruitment_id", a.recruitment_id)
    .order("applicant_code")
    .throwOnError();
  const index = (siblings ?? []).findIndex((x) => x.id === id);
  const neighbors = [siblings?.[index - 1], siblings?.[index + 1]].filter(
    (x): x is { id: string; applicant_code: string } => !!x,
  );
  return (
    <ReviewClient
      neighbors={neighbors}
      applicant={{ ...a, answers: answers ?? [] }}
      criteria={criteria ?? []}
    />
  );
}
