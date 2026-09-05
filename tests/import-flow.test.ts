import { describe, it, expect } from "vitest";
import { prepareImport } from "../src/lib/import/preview";
import { csvEscape } from "../src/lib/archive/csv";
import { normalizeDate } from "../src/lib/import/normalize";
import { safeReturnPath } from "../src/lib/reviewer/navigation";
const mappings = [
  { header: "name", target: "name", confidence: "high" },
  { header: "email", target: "email", confidence: "high" },
  { header: "phone", target: "phone", confidence: "high" },
] as const;
const make = (rows: Record<string, string>[]) => ({
  recruitmentId: "00000000-0000-4000-8000-000000000001",
  rows,
  mappings: [...mappings],
});
describe("import edge cases", () => {
  it("detects ambiguous existing identities", async () => {
    const result = await prepareImport(
      make([{ name: "QA", email: "a@example.test", phone: "01011111111" }]),
      [
        {
          id: "1",
          email: "a@example.test",
          phone: "01022222222",
          source_hash: null,
          applicant_code: "C6-001",
        },
        {
          id: "2",
          email: "b@example.test",
          phone: "01011111111",
          source_hash: null,
          applicant_code: "C6-002",
        },
      ],
    );
    expect(result.summary.invalid).toBe(1);
  });
  it("detects duplicates within a new file", async () => {
    const result = await prepareImport(
      make([
        { name: "A", email: "same@example.test", phone: "" },
        { name: "B", email: "same@example.test", phone: "" },
      ]),
      [],
    );
    expect(result.summary.invalid).toBe(2);
  });
  it("rejects impossible dates", () => {
    expect(normalizeDate("2026.02.30")).toBeNull();
    expect(normalizeDate("2024.02.29")).toBe("2024-02-29");
  });
  it("exports formula-like cells as text", () => {
    expect(csvEscape("=1+1")).toBe("'=1+1");
    expect(csvEscape("  @SUM(A1)")).toBe("'  @SUM(A1)");
  });
  it("only returns to local application paths", () => {
    expect(safeReturnPath("//example.com")).toBe("/applicants");
    expect(safeReturnPath("/\\example.com")).toBe("/applicants");
    expect(safeReturnPath("/interviews")).toBe("/interviews");
  });
});
