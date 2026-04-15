import type { AuctionRow } from "./types";

export interface WinnerStats {
  nickname: string;
  count: number;
  totalAmount: number;
}

export interface WinnerComputation {
  stats: WinnerStats[]; // Sorted: most items, then lowest spend
  candidates: string[]; // Nicknames tied for #1 after both tiebreakers
  unambiguous: string | null; // Set when exactly one candidate remains
}

// Winner algorithm per winner_formula:
//   1. most items won
//   2. tiebreaker: lowest total spend
//   3. still tied → leader picks manually (candidates.length > 1)
export function computeWinner(rows: AuctionRow[]): WinnerComputation {
  const bucket = new Map<string, WinnerStats>();
  for (const row of rows) {
    const nickname = row.winner_nickname.trim();
    if (!nickname) continue;
    const prev =
      bucket.get(nickname) ?? { nickname, count: 0, totalAmount: 0 };
    bucket.set(nickname, {
      nickname,
      count: prev.count + 1,
      totalAmount: prev.totalAmount + (Number(row.amount) || 0),
    });
  }

  const stats = Array.from(bucket.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.totalAmount - b.totalAmount;
  });

  if (stats.length === 0) {
    return { stats: [], candidates: [], unambiguous: null };
  }

  const maxCount = stats[0].count;
  const topByCount = stats.filter((s) => s.count === maxCount);
  const minAmount = Math.min(...topByCount.map((s) => s.totalAmount));
  const candidates = topByCount
    .filter((s) => s.totalAmount === minAmount)
    .map((s) => s.nickname);

  return {
    stats,
    candidates,
    unambiguous: candidates.length === 1 ? candidates[0] : null,
  };
}

export function formatWinnerReason(
  winner: string,
  stats: WinnerStats[],
  manualPick: boolean,
): string {
  const mine = stats.find((s) => s.nickname === winner);
  if (!mine) return "리더 선정";
  const parts = [
    `${mine.count}개 가치관 낙찰`,
    `총 ${mine.totalAmount}만원 사용`,
  ];
  if (manualPick) parts.push("리더 선정");
  return parts.join(" · ");
}
