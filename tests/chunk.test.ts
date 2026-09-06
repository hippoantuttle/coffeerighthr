import { describe, expect, it } from "vitest";
import { chunk } from "@/lib/arrays/chunk";

describe("chunk", () => {
  it("splits large query inputs without dropping trailing rows", () => {
    const items = Array.from({ length: 257 }, (_, index) => index);
    const groups = chunk(items, 100);

    expect(groups.map((group) => group.length)).toEqual([100, 100, 57]);
    expect(groups.flat()).toEqual(items);
  });

  it("returns no query groups for an empty input", () => {
    expect(chunk([], 100)).toEqual([]);
  });
});
