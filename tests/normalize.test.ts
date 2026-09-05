import { describe, expect, it } from "vitest";
import {
  cohortNumber,
  normalizeDate,
  normalizeGoogleFormTimestamp,
} from "../src/lib/import/normalize";

describe("Google Forms normalization", () => {
  it("parses Korean PM timestamp in KST", () => {
    expect(normalizeGoogleFormTimestamp("2026. 8. 22 오후 8:33:05")).toBe(
      "2026-08-22T20:33:05+09:00",
    );
  });
  it("parses Korean midnight timestamp", () => {
    expect(normalizeGoogleFormTimestamp("2026. 8. 24 오전 12:33:29")).toBe(
      "2026-08-24T00:33:29+09:00",
    );
  });
  it("normalizes dotted birth date and ignores redaction marker", () => {
    expect(normalizeDate("2001.01.01")).toBe("2001-01-01");
    expect(normalizeDate("-")).toBeNull();
  });
  it("extracts cohort number for applicant codes", () => {
    expect(cohortNumber("6기")).toBe("6");
  });
});
