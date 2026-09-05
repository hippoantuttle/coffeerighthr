// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  getOrCreateReviewerIdentity,
  getStoredReviewerIdentity,
} from "@/lib/reviewer/identity";

describe("reviewer identity", () => {
  beforeEach(() => localStorage.clear());

  it("uses the trimmed reviewer name as the stable identifier", () => {
    expect(getOrCreateReviewerIdentity("  김민규  ")).toEqual({
      reviewerId: "김민규",
      reviewerName: "김민규",
    });
    expect(localStorage.getItem("coffeeright.reviewerId")).toBe("김민규");
  });

  it("upgrades a browser UUID to the stored reviewer name", () => {
    localStorage.setItem("coffeeright.reviewerId", crypto.randomUUID());
    localStorage.setItem("coffeeright.reviewerName", "김준혁");

    expect(getStoredReviewerIdentity()).toEqual({
      reviewerId: "김준혁",
      reviewerName: "김준혁",
    });
    expect(localStorage.getItem("coffeeright.reviewerId")).toBe("김준혁");
  });
});
