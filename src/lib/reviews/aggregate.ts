export type CriterionWeight = { id: string; weight: number };
export type ScoreRow = { review_id: string; criterion_id: string; score: number };

export function weightedReviewAverages(scores: ScoreRow[], criteria: CriterionWeight[]) {
  const weights = new Map(criteria.map(c => [c.id, Number(c.weight)]));
  const grouped = new Map<string, ScoreRow[]>();
  for (const score of scores) grouped.set(score.review_id, [...(grouped.get(score.review_id) ?? []), score]);
  return [...grouped.entries()].map(([reviewId, rows]) => {
    let weighted = 0;
    let totalWeight = 0;
    for (const row of rows) {
      const w = weights.get(row.criterion_id) ?? 0;
      weighted += row.score * w;
      totalWeight += w;
    }
    return { reviewId, average: totalWeight ? weighted / totalWeight : 0 };
  });
}
