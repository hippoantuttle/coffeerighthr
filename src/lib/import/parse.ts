import Papa from "papaparse";
import type { ParsedCsv } from "./types";

export function parseCsvText(text: string): ParsedCsv {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length) {
    const fatal = parsed.errors.filter((e) => e.type === "Quotes" || e.type === "Delimiter");
    if (fatal.length) throw new Error(fatal.map((e) => e.message).join(" / "));
  }
  const headers = parsed.meta.fields ?? [];
  return { headers, rows: parsed.data.map((row) => Object.fromEntries(headers.map((h) => [h, String(row[h] ?? "").trim()]))) };
}
