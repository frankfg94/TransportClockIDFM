export const VERDICT_SERVER_SCORE_RULES = {
  futureStation: { walkingMinutes: 15, bonus: 1 },
  natureDistances: [
    { maximumMeters: 300, score: 10 },
    { maximumMeters: 600, score: 8 },
    { maximumMeters: 1200, score: 6 },
    { maximumMeters: 2000, score: 4 },
  ],
  natureBeyondScore: 2,
  security: { localWeight: 0.9, trendWeight: 0.1, trendMidpoint: 5, trendDivisor: 10, maximumAdjustment: 0.5, positivePercentile: 0.25, negativePercentile: 0.75 },
} as const;
