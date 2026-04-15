"use client";

import { useEffect, useState } from "react";

const TOTAL_BUDGET = 100; // 만원
const STEP = 5;
const MIN = 0;
const MAX = 100;

export const AUCTION_VALUES = [
  { name: "사랑", emoji: "💝" },
  { name: "우정", emoji: "🤝" },
  { name: "자유", emoji: "🕊️" },
  { name: "성공", emoji: "🏆" },
  { name: "건강", emoji: "💪" },
  { name: "가족", emoji: "👨‍👩‍👧" },
  { name: "믿음", emoji: "🙏" },
  { name: "즐거움", emoji: "🎉" },
  { name: "안정", emoji: "🏡" },
  { name: "성장", emoji: "🌱" },
];

interface BidEntry {
  max_bid: number;
  current_bid: number;
  final_price: number;
  won: boolean;
}

type BidState = Record<string, BidEntry>;

function emptyEntry(): BidEntry {
  return { max_bid: 0, current_bid: 0, final_price: 0, won: false };
}

function defaultState(): BidState {
  return AUCTION_VALUES.reduce<BidState>((acc, v) => {
    acc[v.name] = emptyEntry();
    return acc;
  }, {});
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export default function BiddingBoard({ roomCode }: { roomCode: string }) {
  const storageKey = `bid_board_${roomCode}`;
  const [bids, setBids] = useState<BidState>(defaultState);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, BidEntry>;
        setBids({ ...defaultState(), ...parsed });
      }
    } catch {
      // Ignore corrupt storage
    }
    setHydrated(true);
  }, [storageKey]);

  // Persist on any change (after initial hydration)
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(bids));
    } catch {
      // Non-fatal
    }
  }, [bids, hydrated, storageKey]);

  function update(name: string, patch: Partial<BidEntry>) {
    setBids((prev) => {
      const curr = prev[name] ?? emptyEntry();
      let next: BidEntry = { ...curr, ...patch };
      // Invariants: 0 ≤ current ≤ max ≤ 100, step = 5
      next.max_bid = clamp(next.max_bid, MIN, MAX);
      // If max dropped below current, pull current down with it
      if (next.current_bid > next.max_bid) next.current_bid = next.max_bid;
      next.current_bid = clamp(next.current_bid, MIN, next.max_bid);
      next.final_price = clamp(next.final_price, MIN, 9999);
      return { ...prev, [name]: next };
    });
  }

  const totalCurrent = Object.values(bids).reduce(
    (sum, b) => sum + (b.current_bid || 0),
    0,
  );
  const remaining = TOTAL_BUDGET - totalCurrent;
  const overBudget = remaining < 0;

  return (
    <div className="space-y-3">
      <div
        className={[
          "sticky top-0 z-10 -mx-5 px-5 py-3 backdrop-blur border-b",
          overBudget
            ? "bg-red-50/95 border-red-200"
            : "bg-[color:var(--bg)]/95 border-gray-200",
        ].join(" ")}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            💰 내 잔여 자산
          </span>
          <span
            className={[
              "text-xl font-bold tabular-nums",
              overBudget ? "text-red-600" : "text-brand-600",
            ].join(" ")}
          >
            {remaining}만원
          </span>
        </div>
        {overBudget && (
          <p className="mt-1 text-xs text-red-600">
            예산을 초과했어요. 현재 입찰을 조금 줄여주세요.
          </p>
        )}
      </div>

      <ul className="space-y-2">
        {AUCTION_VALUES.map((v) => {
          const b = bids[v.name] ?? emptyEntry();
          return (
            <li
              key={v.name}
              className={[
                "rounded-2xl border p-4 transition",
                b.won
                  ? "bg-brand-50 border-brand-300 shadow-sm"
                  : "bg-white border-gray-200",
              ].join(" ")}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{v.emoji}</span>
                  <span className="font-semibold">{v.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => update(v.name, { won: !b.won })}
                  className={[
                    "text-xs font-medium px-3 py-1.5 rounded-full border transition",
                    b.won
                      ? "bg-brand-500 text-white border-brand-500"
                      : "bg-white text-gray-500 border-gray-300",
                  ].join(" ")}
                >
                  {b.won ? "낙찰 O" : "낙찰 X"}
                </button>
              </div>

              <StepperRow
                label="최대 입찰"
                value={b.max_bid}
                onDecrement={() =>
                  update(v.name, { max_bid: Math.max(MIN, b.max_bid - STEP) })
                }
                onIncrement={() =>
                  update(v.name, { max_bid: Math.min(MAX, b.max_bid + STEP) })
                }
              />

              <StepperRow
                label="현재 입찰"
                value={b.current_bid}
                onDecrement={() =>
                  update(v.name, {
                    current_bid: Math.max(MIN, b.current_bid - STEP),
                  })
                }
                onIncrement={() =>
                  update(v.name, {
                    current_bid: Math.min(b.max_bid, b.current_bid + STEP),
                  })
                }
                disabled={b.max_bid === 0}
              />

              <div className="mt-3 flex items-center gap-2">
                <label className="text-xs text-gray-500 shrink-0">낙찰가</label>
                <div className="relative flex-1">
                  <input
                    type="number"
                    min={0}
                    value={b.final_price || ""}
                    onChange={(e) =>
                      update(v.name, {
                        final_price: Number(e.target.value) || 0,
                      })
                    }
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-200 pl-2 pr-10 py-1.5 text-sm text-right"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                    만원
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StepperRow({
  label,
  value,
  onDecrement,
  onIncrement,
  disabled = false,
}: {
  label: string;
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDecrement}
          disabled={disabled || value === 0}
          className="w-8 h-8 rounded-lg border border-gray-200 text-gray-700 disabled:opacity-30 hover:bg-gray-50 active:bg-gray-100 text-lg leading-none"
          aria-label={`${label} 감소`}
        >
          −
        </button>
        <span className="w-16 text-center text-sm font-semibold tabular-nums">
          {value}만원
        </span>
        <button
          type="button"
          onClick={onIncrement}
          disabled={disabled}
          className="w-8 h-8 rounded-lg border border-gray-200 text-gray-700 disabled:opacity-30 hover:bg-gray-50 active:bg-gray-100 text-lg leading-none"
          aria-label={`${label} 증가`}
        >
          +
        </button>
      </div>
    </div>
  );
}
