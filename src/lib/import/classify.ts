import type { CanonicalApplicant } from "./transform";

export interface ExistingApplicantRef {
  id: string;
  email: string;
  phone: string | null;
  source_hash: string | null;
  applicant_code: string;
}
export type ImportRowState = "new" | "existing" | "changed" | "invalid";

export function classifyApplicant(
  a: CanonicalApplicant,
  hash: string,
  existing: ExistingApplicantRef[],
  errors: string[],
): { state: ImportRowState; existingId?: string } {
  if (errors.length) return { state: "invalid" };
  const byEmail = existing.find(
    (x) => x.email.toLowerCase() === a.email.toLowerCase(),
  );
  const byPhone = a.phone
    ? existing.find((x) => (x.phone ?? "").replace(/\D/g, "") === a.phone)
    : undefined;
  const match = byEmail ?? byPhone;
  if (!match) return { state: "new" };
  return match.source_hash === hash
    ? { state: "existing", existingId: match.id }
    : { state: "changed", existingId: match.id };
}
