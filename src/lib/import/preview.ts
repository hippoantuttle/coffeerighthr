import { z } from "zod";
import { mappingTargets } from "./types";
import { transformRow } from "./transform";
import { validateApplicant } from "./validate";
import { applicantFingerprint } from "./fingerprint";
import { classifyApplicant, type ExistingApplicantRef } from "./classify";
import { normalizeDate, normalizeGoogleFormTimestamp } from "./normalize";

export const importInput = z.object({
  recruitmentId: z.string().uuid(),
  rows: z.array(z.record(z.string(), z.string())).min(1).max(2000),
  mappings: z
    .array(
      z.object({
        header: z.string(),
        target: z.enum(mappingTargets),
        confidence: z.enum(["high", "medium", "low"]),
      }),
    )
    .min(1),
});

export async function prepareImport(
  input: z.infer<typeof importInput>,
  existing: ExistingApplicantRef[],
) {
  const applicants = input.rows.map((row) => transformRow(row, input.mappings));
  const output = await Promise.all(
    applicants.map(async (a, index) => {
      const errors = validateApplicant(a);
      if (
        applicants.some(
          (other, i) =>
            i !== index &&
            (other.email === a.email || (a.phone && other.phone === a.phone)),
        )
      )
        errors.push("파일 내부 이메일 또는 전화번호 중복");
      const emails = existing.filter((x) => x.email.toLowerCase() === a.email);
      const phones = a.phone
        ? existing.filter((x) => (x.phone ?? "").replace(/\D/g, "") === a.phone)
        : [];
      if (
        phones.length > 1 ||
        (emails[0] && phones[0] && emails[0].id !== phones[0].id)
      )
        errors.push("이메일과 전화번호가 서로 다른 지원자와 일치합니다.");
      if (a.birthDate && a.birthDate !== "-" && !normalizeDate(a.birthDate))
        errors.push("생년월일 형식을 확인해주세요.");
      const sourceHash = await applicantFingerprint(a);
      return {
        rowNumber: index + 2,
        name: a.name,
        email: a.email,
        phone: a.phone,
        errors,
        sourceHash,
        ...classifyApplicant(a, sourceHash, existing, errors),
      };
    }),
  );
  return {
    rows: output,
    summary: output.reduce(
      (counts, row) => {
        counts[row.state]++;
        return counts;
      },
      { new: 0, changed: 0, existing: 0, invalid: 0 },
    ),
    snapshot: Object.fromEntries(existing.map((a) => [a.id, a.source_hash])),
    payload: applicants.map((a, i) => ({
      name: a.name,
      email: a.email,
      phone: a.phone,
      major: a.major,
      student_number: a.studentNumber,
      grade: a.grade,
      gender: a.gender,
      birth_date: normalizeDate(a.birthDate),
      interests: a.interests,
      interview_availability: a.interviewAvailability,
      source_submitted_at: normalizeGoogleFormTimestamp(a.submittedAt),
      source_hash: output[i].sourceHash,
      consent_text: a.consent,
      application_source: a.source,
      session_confirmation: a.sessionConfirmation,
      ot_mt_reason: a.otMtReason,
      source_data: a.raw,
      extra_fields: a.extras,
      answers: a.answers,
    })),
  };
}
