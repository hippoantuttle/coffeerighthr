import type { ColumnMapping } from "./types";
import { normalizeEmail, normalizePhone, splitMultiValue } from "./normalize";

export interface CanonicalApplicant {
  submittedAt: string; consent: string; name: string; email: string; phone: string;
  major: string; studentNumber: string; grade: string; gender: string; birthDate: string;
  interests: string[]; source: string; interviewAvailability: string; sessionConfirmation: string; otMtReason: string;
  answers: { key: string; question: string; answer: string }[];
  extras: Record<string,string>;
  raw: Record<string,string>;
}

export function transformRow(row: Record<string,string>, mappings: ColumnMapping[]): CanonicalApplicant {
  const get = (target: ColumnMapping["target"]) => mappings.filter((m) => m.target === target).map((m) => row[m.header] ?? "").filter(Boolean).join("\n");
  const answer = (target: ColumnMapping["target"], key: string) => mappings.filter((m) => m.target === target).map((m) => ({ key, question:m.header, answer:row[m.header] ?? "" })).filter((a) => a.answer);
  const extras: Record<string,string> = {};
  for (const m of mappings.filter((m) => m.target === "extra")) extras[m.header] = row[m.header] ?? "";
  return {
    submittedAt:get("submittedAt"), consent:get("consent"), name:get("name").trim(),
    email:normalizeEmail(get("email")), phone:normalizePhone(get("phone")), major:get("major"), studentNumber:get("studentNumber"),
    grade:get("grade"), gender:get("gender"), birthDate:get("birthDate"), interests:splitMultiValue(get("interests")),
    source:get("source"), interviewAvailability:get("interviewAvailability"), sessionConfirmation:get("sessionConfirmation"), otMtReason:get("otMtReason"),
    answers:[...answer("answerMotivation","motivation"), ...answer("answerActivity","activity"), ...answer("answerCollaboration","collaboration")],
    extras, raw:row,
  };
}
