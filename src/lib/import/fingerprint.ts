import { sha256 } from "@/lib/hash/sha256";
import type { CanonicalApplicant } from "./transform";

export async function applicantFingerprint(
  a: CanonicalApplicant,
): Promise<string> {
  const stable = {
    name: a.name,
    email: a.email,
    phone: a.phone,
    major: a.major,
    studentNumber: a.studentNumber,
    grade: a.grade,
    gender: a.gender,
    birthDate: a.birthDate,
    interests: a.interests,
    source: a.source,
    interviewAvailability: a.interviewAvailability,
    sessionConfirmation: a.sessionConfirmation,
    otMtReason: a.otMtReason,
    answers: a.answers,
    extras: a.extras,
    raw: a.raw,
  };
  return sha256(JSON.stringify(stable));
}
