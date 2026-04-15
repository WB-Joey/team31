import type { MemberBid } from "./types";

// Every member starts with ₩1억. Used by the bidding UI and the leader's live
// budget panel alike.
export const MEMBER_TOTAL_BUDGET = 100_000_000;

// Committed = currently locked bids (still being resolved) + already-won bids.
// Lost bids are refunded, so they don't count.
export function committedAmount(bids: MemberBid[]): number {
  return bids
    .filter((b) => b.status === "bidding" || b.status === "won")
    .reduce((sum, b) => sum + b.amount, 0);
}

export function remainingBudgetFromBids(bids: MemberBid[]): number {
  return MEMBER_TOTAL_BUDGET - committedAmount(bids);
}
