export function csvEscape(value: unknown): string {
  if (value == null) return "";
  const raw = Array.isArray(value)
    ? value.join(" | ")
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  const text = /^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  headers: string[],
  rows: Record<string, unknown>[],
): string {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(",")),
  ].join("\n");
}
