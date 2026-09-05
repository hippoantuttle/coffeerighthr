import { describe, it, expect } from "vitest";
import { classifyApplicant } from "../src/lib/import/classify";
import type { CanonicalApplicant } from "../src/lib/import/transform";
const a = {
  name: "김민규",
  email: "test@yonsei.ac.kr",
  phone: "01012345678",
} as CanonicalApplicant;
describe("dedupe classification", () => {
  it("marks new when no identifier matches", () =>
    expect(classifyApplicant(a, "h", [], []).state).toBe("new"));
  it("marks existing when hash is unchanged", () =>
    expect(
      classifyApplicant(
        a,
        "h",
        [
          {
            id: "1",
            email: a.email,
            phone: a.phone,
            source_hash: "h",
            applicant_code: "C6-001",
          },
        ],
        [],
      ).state,
    ).toBe("existing"));
  it("marks changed when identifier matches and content differs", () =>
    expect(
      classifyApplicant(
        a,
        "new",
        [
          {
            id: "1",
            email: a.email,
            phone: a.phone,
            source_hash: "old",
            applicant_code: "C6-001",
          },
        ],
        [],
      ).state,
    ).toBe("changed"));
  it("marks invalid before dedupe", () =>
    expect(classifyApplicant(a, "h", [], ["error"]).state).toBe("invalid"));
});
