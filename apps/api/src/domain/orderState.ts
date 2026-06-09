export const allowedOrderTransitions = {
  DRAFT: ["PENDING", "CANCELLED"],
  PENDING: ["CONFIRMED", "NEEDS_HUMAN_REVIEW", "CANCELLED"],
  CONFIRMED: ["FULFILLED", "CANCELLED"],
  FULFILLED: [],
  CANCELLED: [],
  NEEDS_HUMAN_REVIEW: ["PENDING", "CONFIRMED", "CANCELLED"]
} as const;

export function canTransitionOrder(from: keyof typeof allowedOrderTransitions, to: string) {
  return (allowedOrderTransitions[from] as readonly string[]).includes(to);
}
