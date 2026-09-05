import { describe, expect, it } from "vitest";
import { csvEscape, toCsv } from "../src/lib/archive/csv";

describe("archive csv", () => {
  it("escapes commas, quotes and newlines", () => {
    expect(csvEscape('a,"b"\nc')).toBe('"a,""b""\nc"');
  });
  it("keeps a stable header order", () => {
    expect(toCsv(["a", "b"], [{ a: 1, b: 2 }])).toBe("a,b\n1,2");
  });
});
