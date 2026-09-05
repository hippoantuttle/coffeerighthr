export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}
export function normalizePhone(value: string) {
  return value.replace(/[^0-9]/g, "");
}
export function splitMultiValue(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}
export function normalizeDate(value: string): string | null {
  const v = value.trim();
  if (!v || v === "-") return null;
  const m = v.match(/^(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})\.?$/);
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (
    date.getUTCFullYear() !== Number(m[1]) ||
    date.getUTCMonth() !== Number(m[2]) - 1 ||
    date.getUTCDate() !== Number(m[3])
  )
    return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** Google Forms Korean locale timestamp -> ISO string in KST. */
export function normalizeGoogleFormTimestamp(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  // Example: 2026. 8. 22 오후 8:33:05 / 2026. 8. 23 오전 12:08:21
  const m = v.match(
    /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\s+(오전|오후)\s+(\d{1,2}):(\d{2}):(\d{2})$/,
  );
  if (!m) {
    const parsed = new Date(v);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const [, year, month, day, ampm, rawHour, minute, second] = m;
  let hour = Number(rawHour) % 12;
  if (ampm === "오후") hour += 12;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute}:${second}+09:00`;
}

export function cohortNumber(value: string): string {
  return value.match(/\d+/)?.[0] ?? value.replace(/\s+/g, "");
}
