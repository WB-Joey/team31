"use client";

import { useMemo } from "react";
import { MEMBER_TOTAL_BUDGET, remainingBudgetFromBids } from "@/lib/budget";
import { formatKoreanAmount } from "@/lib/koreanAmount";
import type { Participant } from "@/lib/useParticipants";

interface Props {
  participants: Participant[];
}

interface Row {
  id: string;
  nickname: string;
  remaining: number;
  pct: number;
}

function barColor(pct: number): { bar: string; text: string } {
  if (pct <= 20) return { bar: "bg-red-500", text: "text-red-600" };
  if (pct <= 50) return { bar: "bg-amber-400", text: "text-amber-600" };
  return { bar: "bg-emerald-500", text: "text-emerald-600" };
}

export default function MemberBudgetPanel({ participants }: Props) {
  const rows = useMemo<Row[]>(() => {
    return participants
      .filter((p) => !p.is_leader)
      .map((p) => {
        // Prefer the stored column; fall back to derived for sessions that
        // predate the remaining_budget migration.
        const remaining =
          typeof p.remaining_budget === "number"
            ? p.remaining_budget
            : remainingBudgetFromBids(p.bids);
        const pct = Math.max(
          0,
          Math.min(100, (remaining / MEMBER_TOTAL_BUDGET) * 100),
        );
        return { id: p.id, nickname: p.nickname, remaining, pct };
      })
      .sort((a, b) => b.remaining - a.remaining);
  }, [participants]);

  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-4">
      <h3 className="text-sm font-semibold mb-3">💰 팀원 예산 현황</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-3">
          입장한 팀원이 없어요
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const color = barColor(r.pct);
            return (
              <li
                key={r.id}
                className="flex items-center gap-3 text-sm"
              >
                <span className="w-16 shrink-0 truncate font-medium text-gray-800">
                  {r.nickname}
                </span>
                <div className="flex-1 min-w-0 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={[
                      "h-full rounded-full transition-all duration-500",
                      color.bar,
                    ].join(" ")}
                    style={{ width: `${r.pct}%` }}
                  />
                </div>
                <span
                  className={[
                    "w-20 shrink-0 text-right tabular-nums text-xs font-semibold",
                    color.text,
                  ].join(" ")}
                >
                  {formatKoreanAmount(r.remaining)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
