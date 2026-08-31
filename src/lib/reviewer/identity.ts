import type { ReviewerIdentity } from "@/lib/types/domain";

const REVIEWER_ID_KEY = "coffeeright.reviewerId";
const REVIEWER_NAME_KEY = "coffeeright.reviewerName";

export function getOrCreateReviewerIdentity(name: string): ReviewerIdentity {
  if (typeof window === "undefined") {
    throw new Error("Reviewer identity can only be created in the browser.");
  }

  let reviewerId = window.localStorage.getItem(REVIEWER_ID_KEY);
  if (!reviewerId) {
    reviewerId = crypto.randomUUID();
    window.localStorage.setItem(REVIEWER_ID_KEY, reviewerId);
  }

  window.localStorage.setItem(REVIEWER_NAME_KEY, name.trim());
  return { reviewerId, reviewerName: name.trim() };
}
