import type { CanonicalApplicant } from "./transform";

export function validateApplicant(row: CanonicalApplicant): string[] {
  const errors: string[] = [];
  if (!row.name) errors.push("성명 컬럼 또는 값이 없습니다.");
  if (!row.email) errors.push("이메일 컬럼 또는 값이 없습니다.");
  else if (!/^\S+@\S+\.\S+$/.test(row.email)) errors.push("이메일 형식이 올바르지 않습니다.");
  if (row.phone && row.phone.length < 9) errors.push("전화번호가 너무 짧습니다.");
  return errors;
}
