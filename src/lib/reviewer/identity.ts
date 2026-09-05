import type { ReviewerIdentity } from "@/lib/types/domain";

const REVIEWER_ID_KEY = "coffeeright.reviewerId";
const REVIEWER_NAME_KEY = "coffeeright.reviewerName";

export function getOrCreateReviewerIdentity(name: string): ReviewerIdentity {
  if (typeof window === "undefined") {
    throw new Error("Reviewer identity can only be created in the browser.");
  }

  const reviewerName = name.trim();
  if (!reviewerName) throw new Error("평가자 이름을 입력해주세요.");

  window.localStorage.setItem(REVIEWER_ID_KEY, reviewerName);
  window.localStorage.setItem(REVIEWER_NAME_KEY, reviewerName);
  return { reviewerId: reviewerName, reviewerName };
}

export function getStoredReviewerIdentity(): ReviewerIdentity | null {
  if (typeof window === "undefined") return null;
  const reviewerName = window.localStorage
    .getItem(REVIEWER_NAME_KEY)
    ?.trim();
  return reviewerName ? getOrCreateReviewerIdentity(reviewerName) : null;
}
