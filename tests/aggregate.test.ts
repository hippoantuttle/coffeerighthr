import { describe, expect, it } from "vitest";
import { weightedReviewAverages } from "../src/lib/reviews/aggregate";

describe("document review aggregation", () => {
  it("calculates 30/30/20/20 weighted reviewer average", () => {
    const criteria = [{id:"a",weight:30},{id:"b",weight:30},{id:"c",weight:20},{id:"d",weight:20}];
    const scores = [
      {review_id:"r1",criterion_id:"a",score:5},
      {review_id:"r1",criterion_id:"b",score:4},
      {review_id:"r1",criterion_id:"c",score:3},
      {review_id:"r1",criterion_id:"d",score:2},
    ];
    expect(weightedReviewAverages(scores, criteria)[0].average).toBeCloseTo(3.7);
  });
});
