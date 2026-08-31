import { describe, expect, it } from "vitest";
import { interviewAggregate } from "../src/lib/reviews/interview";

describe("interviewAggregate", () => {
  it("keeps interview scoring independent and weighted per reviewer", () => {
    const criteria = [{ id:"a", weight:30 }, { id:"b", weight:30 }, { id:"c", weight:25 }, { id:"d", weight:15 }];
    const scores = [
      { review_id:"r1", criterion_id:"a", score:5 }, { review_id:"r1", criterion_id:"b", score:5 },
      { review_id:"r1", criterion_id:"c", score:5 }, { review_id:"r1", criterion_id:"d", score:5 },
      { review_id:"r2", criterion_id:"a", score:3 }, { review_id:"r2", criterion_id:"b", score:3 },
      { review_id:"r2", criterion_id:"c", score:3 }, { review_id:"r2", criterion_id:"d", score:3 },
    ];
    expect(interviewAggregate(scores, criteria)).toEqual({ average:4, min:3, max:5, count:2, highVariance:true });
  });
});
