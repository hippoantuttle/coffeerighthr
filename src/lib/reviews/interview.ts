import {
  weightedReviewAverages,
  type CriterionWeight,
  type ScoreRow,
} from "./aggregate";

export function interviewAggregate(
  scores: ScoreRow[],
  criteria: CriterionWeight[],
) {
  const averages = weightedReviewAverages(scores, criteria).map(
    (row) => row.average,
  );
  if (!averages.length) return null;
  const min = Math.min(...averages);
  const max = Math.max(...averages);
  return {
    average: averages.reduce((sum, value) => sum + value, 0) / averages.length,
    min,
    max,
    count: averages.length,
    highVariance: max - min >= 2,
  };
}
