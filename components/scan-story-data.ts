export const AUREA_METRICS = {
  initial: {
    rating: 3.4,
    reviews: 120,
    rank: 5,
  },
  final: {
    rating: 4.8,
    reviews: 1526,
    rank: 1,
  },
} as const;

export function formatReviewCount(value: number) {
  return new Intl.NumberFormat("sr-Latn-RS").format(value);
}
