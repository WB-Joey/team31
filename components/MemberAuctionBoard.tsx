"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SlotMachine from "./SlotMachine";
import {
  auctionHasStarted,
  spinElapsedMs,
  unrevealedValues,
} from "@/lib/auctionState";
import {
  MEMBER_TOTAL_BUDGET,
  remainingBudgetFromBids,
} from "@/lib/budget";
import { formatKoreanAmount } from "@/lib/koreanAmount";
import { getSupabaseClient } from "@/lib/supabase";
import type {
  AuctionState,
  AuctionValue,
  AwardedEntry,
  MemberBid,
} from "@/lib/types";
import type { Participant } from "@/lib/useParticipants";

export { MEMBER_TOTAL_BUDGET };
const STEP = 1_000_000; // 100만원 단위

function formatWon(n: number): string {
  return n.toLocaleString("ko-KR");
}

// Mirror the confirmed-bid list to localStorage so the member result screen
// can rebuild each player's report from their own device even when DB
// per-participant state is noisy or the lookup by nickname collides.
function persistBidsToLocalStorage(roomCode: string, bids: MemberBid[]) {
  try {
    window.localStorage.setItem(
      `bids_${roomCode}`,
      JSON.stringify(bids),
    );
  } catch {
    // Non-fatal — report will fall back to DB participant bids.
  }
}

interface Props {
  roomCode: string;
  state: AuctionState;
  myParticipantId: string | null;
  myBids: MemberBid[];
  participants: Participant[];
}

interface RevealedItem {
  value: AuctionValue;
  award: AwardedEntry | null;
}

interface Transition {
  type: "won" | "lost";
  amount: number;
  valueName: string;
}

export default function MemberAuctionBoard({
  roomCode,
  state,
  myParticipantId,
  myBids,
  participants,
}: Props) {
  // Draft amounts live locally per value until the member hits [입찰 확정].
  const draftKey = `member_bid_draft_${roomCode}`;
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) setDrafts(JSON.parse(raw));
    } catch {
      // Ignore corrupt storage
    }
  }, [draftKey]);
  useEffect(() => {
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(drafts));
    } catch {
      // Ignore storage errors
    }
  }, [drafts, draftKey]);

  // Spin clock (same as leader, no cleanup writes)
  const [spinActive, setSpinActive] = useState(false);
  useEffect(() => {
    if (!state.spin) {
      setSpinActive(false);
      return;
    }
    const elapsed = spinElapsedMs(state.spin);
    if (elapsed >= state.spin.duration_ms) {
      setSpinActive(false);
      return;
    }
    setSpinActive(true);
    const remaining = state.spin.duration_ms - elapsed;
    const t = setTimeout(() => setSpinActive(false), remaining);
    return () => clearTimeout(t);
  }, [state.spin?.winner_id, state.spin?.started_at]);

  const started = auctionHasStarted(state);

  const currentValue = useMemo(
    () => state.values.find((v) => v.id === state.current_id) ?? null,
    [state.values, state.current_id],
  );

  const spinWinner = useMemo(
    () =>
      state.spin
        ? state.values.find((v) => v.id === state.spin!.winner_id) ?? null
        : null,
    [state.spin, state.values],
  );

  const unrevealedPool = useMemo(() => unrevealedValues(state), [state]);

  const revealedHistory = useMemo<RevealedItem[]>(() => {
    return [...state.revealed_ids]
      .reverse()
      .map((id): RevealedItem | null => {
        const value = state.values.find((v) => v.id === id);
        if (!value) return null;
        return { value, award: state.awarded[id] ?? null };
      })
      .filter((x): x is RevealedItem => x !== null);
  }, [state.revealed_ids, state.values, state.awarded]);

  // Budget = total − (currently locked bids + already-won bids)
  const committedAmount = useMemo(
    () =>
      myBids
        .filter((b) => b.status === "bidding" || b.status === "won")
        .reduce((sum, b) => sum + b.amount, 0),
    [myBids],
  );
  const remaining = MEMBER_TOTAL_BUDGET - committedAmount;

  const currentBid = useMemo(
    () =>
      currentValue
        ? myBids.find((b) => b.value_id === currentValue.id) ?? null
        : null,
    [myBids, currentValue],
  );

  const topBidder = useMemo<{
    nickname: string;
    amount: number;
  } | null>(() => {
    if (!currentValue) return null;
    let best: { nickname: string; amount: number } | null = null;
    for (const p of participants) {
      if (p.is_leader) continue;
      const bid = p.bids.find(
        (b) => b.value_id === currentValue.id && b.status === "bidding",
      );
      if (bid && (!best || bid.amount > best.amount)) {
        best = { nickname: p.nickname, amount: bid.amount };
      }
    }
    return best;
  }, [currentValue, participants]);

  // Transient banner when a locked bid resolves (won / lost). Compares the
  // latest bids snapshot against the previous one; any 'bidding' → 'won' or
  // 'bidding' → 'lost' fires the banner with a refund-style count-up.
  const prevBidsRef = useRef<MemberBid[]>([]);
  const [transition, setTransition] = useState<Transition | null>(null);
  useEffect(() => {
    const prev = prevBidsRef.current;
    for (const b of myBids) {
      const p = prev.find((x) => x.value_id === b.value_id);
      if (!p) continue;
      if (
        p.status === "bidding" &&
        (b.status === "won" || b.status === "lost")
      ) {
        const v = state.values.find((x) => x.id === b.value_id);
        const name = v?.name ?? "항목";
        setTransition({ type: b.status, amount: b.amount, valueName: name });
        const t = setTimeout(() => setTransition(null), 3500);
        return () => clearTimeout(t);
      }
    }
    prevBidsRef.current = myBids;
  }, [myBids, state.values]);

  // Keep the ref in sync after reads have settled
  useEffect(() => {
    prevBidsRef.current = myBids;
  }, [myBids]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function setDraft(id: string, amount: number) {
    const cap = Math.max(0, remaining + (currentBid?.amount ?? 0));
    setDrafts((prev) => ({
      ...prev,
      [id]: Math.max(0, Math.min(cap, amount)),
    }));
  }

  async function handleConfirmBid() {
    if (!myParticipantId || !currentValue) {
      setErrorMsg("참가자 정보를 찾을 수 없어요. 다시 입장해주세요.");
      return;
    }
    const amount = drafts[currentValue.id] ?? 0;
    if (amount <= 0) {
      setErrorMsg("0원 이상 입찰해주세요");
      return;
    }
    if (amount > remaining + (currentBid?.amount ?? 0)) {
      setErrorMsg("잔여 자산을 초과했어요");
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    const newBid: MemberBid = {
      value_id: currentValue.id,
      amount,
      status: "bidding",
      confirmed_at: new Date().toISOString(),
    };
    const nextBids = [
      ...myBids.filter((b) => b.value_id !== currentValue.id),
      newBid,
    ];
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("participants")
      .update({
        bids: nextBids,
        remaining_budget: remainingBudgetFromBids(nextBids),
      })
      .eq("id", myParticipantId);
    setSaving(false);
    if (error) setErrorMsg(error.message);
    else persistBidsToLocalStorage(roomCode, nextBids);
  }

  async function handleCancelBid() {
    if (!myParticipantId || !currentValue) return;
    setSaving(true);
    setErrorMsg(null);
    const nextBids = myBids.filter((b) => b.value_id !== currentValue.id);
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("participants")
      .update({
        bids: nextBids,
        remaining_budget: remainingBudgetFromBids(nextBids),
      })
      .eq("id", myParticipantId);
    setSaving(false);
    if (error) setErrorMsg(error.message);
    else persistBidsToLocalStorage(roomCode, nextBids);
  }

  // --- Terminal states -----------------------------------------------------

  if (state.ended) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-6 text-center">
        <div className="text-4xl mb-2">🏁</div>
        <p className="font-semibold">경매가 종료됐어요</p>
        <p className="mt-1 text-sm text-gray-500">잠시 후 결과가 공개돼요</p>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
          <div className="text-5xl mb-3 animate-pulse">⏳</div>
          <p className="font-semibold text-lg">경매 시작을 기다리는 중...</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white p-5 text-center">
          <p className="text-xs opacity-80">💰 내 총 자산</p>
          <p className="mt-1 tabular-nums">
            <span className="text-sm font-medium opacity-90 mr-1">₩</span>
            <span className="text-3xl font-bold">
              {formatWon(MEMBER_TOTAL_BUDGET)}
            </span>
          </p>
        </div>
        <p className="text-xs text-gray-500 text-center">
          리더가 가치를 공개하면 여기에 카드가 나타나요
        </p>
      </div>
    );
  }

  // --- Live phase ----------------------------------------------------------

  const draftAmount = currentValue ? drafts[currentValue.id] ?? 0 : 0;

  return (
    <div className="space-y-4">
      <BudgetBar
        remaining={remaining}
        projectedRemaining={
          remaining - (currentBid?.status === "bidding" ? 0 : draftAmount)
        }
        total={MEMBER_TOTAL_BUDGET}
      />

      {transition && transition.type === "won" && (
        <WinCelebrationModal
          valueName={transition.valueName}
          amount={transition.amount}
          onClose={() => setTransition(null)}
        />
      )}
      {transition && transition.type === "lost" && (
        <BidLostModal
          amount={transition.amount}
          onClose={() => setTransition(null)}
        />
      )}

      {/* Slot machine takes precedence over the current card during a spin */}
      {spinActive && spinWinner && state.spin ? (
        <SlotMachine
          winner={spinWinner}
          pool={unrevealedPool.length > 0 ? unrevealedPool : [spinWinner]}
          durationMs={Math.max(
            0,
            state.spin.duration_ms - spinElapsedMs(state.spin),
          )}
        />
      ) : currentValue ? (
        <CurrentCard
          value={currentValue}
          currentBid={currentBid}
          draftAmount={draftAmount}
          onDraft={(amt) => setDraft(currentValue.id, amt)}
          onConfirm={handleConfirmBid}
          onCancel={handleCancelBid}
          step={STEP}
          remaining={remaining}
          saving={saving}
          disabled={!myParticipantId}
          topBidder={topBidder}
        />
      ) : (
        <div className="rounded-2xl bg-white border border-gray-200 p-5 text-center">
          <div className="text-3xl mb-1">⏭️</div>
          <p className="text-sm font-medium">다음 항목을 기다리는 중...</p>
        </div>
      )}

      {errorMsg && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {errorMsg}
        </p>
      )}

      {revealedHistory.length > 0 && (
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <h3 className="text-sm font-semibold mb-2">
            📜 지금까지 공개된 항목 ({revealedHistory.length})
          </h3>
          <ul className="space-y-1.5 max-h-72 overflow-y-auto">
            {revealedHistory.map(({ value, award }, i) => {
              const highlight = i === 0;
              const myRow = myBids.find((b) => b.value_id === value.id);
              const base = highlight
                ? "bg-brand-50 animate-slide-in"
                : "bg-gray-50";
              return (
                <li
                  key={value.id}
                  className={[
                    "flex items-center justify-between gap-2 text-sm px-2 py-1.5 rounded-lg",
                    base,
                  ].join(" ")}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span>{value.category_emoji}</span>
                    <span className="font-medium truncate">{value.name}</span>
                    {myRow?.status === "won" && (
                      <span className="text-[10px] font-bold text-emerald-600 shrink-0">
                        🏆 내 낙찰
                      </span>
                    )}
                    {myRow?.status === "lost" && (
                      <span className="text-[10px] font-bold text-gray-500 shrink-0">
                        😢 유찰
                      </span>
                    )}
                  </span>
                  {award ? (
                    <span className="text-gray-600 tabular-nums shrink-0">
                      {award.winner_nickname} · ₩{formatWon(award.amount)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 shrink-0">유찰</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function BidLostModal({
  amount,
  onClose,
}: {
  amount: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-slate-50 border border-slate-200 p-7 shadow-2xl text-center animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-5xl mb-3">😢</p>
        <p className="text-xl font-extrabold text-slate-700">
          아쉽게도 유찰되었어요
        </p>
        <p className="mt-3 text-base text-slate-800">
          💸{" "}
          <b className="tabular-nums">
            ₩{amount.toLocaleString("ko-KR")}
          </b>
          이 반환되었어요
        </p>
        <p className="mt-1 text-sm text-slate-500">
          다음 가치관을 노려보세요! 💪
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-slate-600 hover:bg-slate-700 text-white font-semibold py-3 text-sm"
        >
          확인
        </button>
      </div>
    </div>
  );
}

function CurrentCard({
  value,
  currentBid,
  draftAmount,
  onDraft,
  onConfirm,
  onCancel,
  step,
  remaining,
  saving,
  disabled,
  topBidder,
}: {
  value: AuctionValue;
  currentBid: MemberBid | null;
  draftAmount: number;
  onDraft: (amount: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
  step: number;
  remaining: number;
  saving: boolean;
  disabled: boolean;
  topBidder: { nickname: string; amount: number } | null;
}) {
  const locked = currentBid?.status === "bidding";

  const [raiseMode, setRaiseMode] = useState<{ prevAmount: number } | null>(
    null,
  );

  useEffect(() => {
    if (locked) setRaiseMode(null);
  }, [locked]);

  const minAmount = raiseMode
    ? Math.max(raiseMode.prevAmount, topBidder?.amount ?? 0) + step
    : 0;
  const displayAmount = locked ? currentBid!.amount : draftAmount;
  const canIncrement = !locked && draftAmount + step <= remaining;
  const canDecrement =
    !locked && draftAmount - step >= minAmount && draftAmount - step >= 0;

  function handleRaise() {
    if (!currentBid) return;
    const prev = currentBid.amount;
    const highestBid = topBidder?.amount ?? 0;
    const startFrom = Math.max(prev, highestBid) + step;
    onCancel();
    onDraft(startFrom);
    setRaiseMode({ prevAmount: prev });
  }

  function handleForfeit() {
    onCancel();
    onDraft(0);
    setRaiseMode(null);
  }

  return (
    <div
      key={value.id}
      className="rounded-2xl text-white p-5 shadow-sm animate-pop-in bg-gradient-to-br from-brand-500 to-brand-600"
    >
      <div className="flex items-center justify-between text-xs opacity-80">
        <span>지금 공개된 항목</span>
        <span>{locked ? "🔒 입찰 중" : "🎉"}</span>
      </div>
      <div className="mt-2 flex items-start gap-3">
        <span className="text-4xl">{value.category_emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs opacity-80">{value.category}</p>
          <p className="text-3xl font-bold">{value.name}</p>
        </div>
      </div>

      {(raiseMode || locked) && topBidder && (
        <div className="mt-4 rounded-xl bg-white/20 px-3 py-2.5 text-center">
          <p className="text-xs font-semibold">
            🏆 현재 최고 입찰가: {formatKoreanAmount(topBidder.amount)} ({topBidder.nickname}님)
          </p>
          {raiseMode && (
            <p className="text-[11px] opacity-80 mt-0.5">
              현재 최고 입찰가는 {formatKoreanAmount(topBidder.amount)}이에요. 이보다 높게 입찰해야 낙찰받을 수 있어요!
            </p>
          )}
        </div>
      )}

      <div className={["rounded-xl bg-white/15 p-4", raiseMode || locked ? "mt-3" : "mt-5"].join(" ")}>
        <p className="text-xs opacity-90 mb-3 text-center">
          {locked
            ? "입찰 확정 금액"
            : raiseMode
              ? `이전 입찰가: ${formatKoreanAmount(raiseMode.prevAmount)} → 새 금액 설정`
              : "내 입찰가"}
        </p>
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => onDraft(displayAmount - step)}
            disabled={locked || saving || !canDecrement}
            className="shrink-0 w-14 h-14 rounded-full bg-white text-brand-700 hover:bg-brand-50 active:bg-brand-100 text-3xl font-black shadow-md flex items-center justify-center select-none disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="감소"
          >
            −
          </button>
          <div className="flex-1 text-center tabular-nums">
            <span className="text-base opacity-90 mr-1">₩</span>
            <span className="text-3xl font-extrabold">
              {formatWon(displayAmount)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onDraft(displayAmount + step)}
            disabled={locked || saving || !canIncrement}
            className={[
              "shrink-0 w-14 h-14 rounded-full text-3xl font-black shadow-md flex items-center justify-center select-none disabled:cursor-not-allowed",
              !locked && !canIncrement
                ? "bg-red-500 text-white opacity-80"
                : "bg-white text-brand-700 hover:bg-brand-50 active:bg-brand-100 disabled:opacity-40",
            ].join(" ")}
            aria-label="증가"
          >
            +
          </button>
        </div>
        <p className="mt-3 text-[11px] opacity-80 text-center">
          ₩{formatWon(step)} 단위
        </p>
      </div>

      {locked ? (
        <div className="mt-3 space-y-2">
          <div className="rounded-xl bg-white/20 py-3 px-3 text-center">
            <p className="text-sm font-semibold">
              ⏳ 입찰 중...
            </p>
            <p className="text-[11px] opacity-80 mt-0.5">
              더 올리려면 [금액 올리기]를 눌러주세요
            </p>
          </div>
          <button
            type="button"
            onClick={handleRaise}
            disabled={saving}
            className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold py-3.5 text-base shadow-sm disabled:opacity-50"
          >
            📈 금액 올리기
          </button>
          <button
            type="button"
            onClick={handleForfeit}
            disabled={saving}
            className="w-full rounded-xl bg-white/10 hover:bg-white/20 text-white/70 border border-white/20 font-medium py-2.5 text-xs disabled:opacity-50"
          >
            🚫 입찰 포기
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onConfirm}
          disabled={saving || disabled || draftAmount <= 0}
          className="mt-3 w-full rounded-xl font-bold py-3.5 text-base shadow-sm disabled:opacity-50 bg-white text-brand-700 hover:bg-brand-50"
        >
          💰 입찰 확정
        </button>
      )}
    </div>
  );
}

function BudgetBar({
  remaining,
  projectedRemaining,
  total,
}: {
  remaining: number;
  projectedRemaining: number;
  total: number;
}) {
  // What we show is the *projected* amount (committed minus the current draft)
  // so tapping +/- makes the number move immediately.
  const shown = Math.max(0, projectedRemaining);
  const animated = useAnimatedNumber(shown);
  const ratio = total > 0 ? shown / total : 0;
  const critical = ratio <= 0.2;
  const low = ratio <= 0.5;
  const barColor = critical
    ? "bg-red-500"
    : low
      ? "bg-amber-400"
      : "bg-emerald-500";
  const textColor = critical
    ? "text-red-600"
    : low
      ? "text-amber-700"
      : "text-emerald-700";
  const overBudget = projectedRemaining < 0;
  return (
    <div
      className={[
        "sticky top-0 z-10 -mx-5 px-5 py-2.5 bg-white/95 backdrop-blur border-b border-gray-100",
        critical ? "animate-shake" : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-gray-500">남은 예산</span>
        <span
          className={[
            "tabular-nums",
            overBudget ? "text-red-500" : textColor,
          ].join(" ")}
        >
          <span className="text-[11px] font-medium mr-0.5 opacity-80">₩</span>
          <span className="font-bold">{animated.toLocaleString("ko-KR")}</span>{" "}
          <span className="text-[11px] text-gray-400">
            / ₩{total.toLocaleString("ko-KR")}
          </span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={[
            "h-full rounded-full transition-all duration-300 ease-out",
            barColor,
          ].join(" ")}
          style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }}
        />
      </div>
      {projectedRemaining < remaining && !overBudget && (
        <p className="mt-1 text-[10px] text-gray-400 text-right tabular-nums">
          (확정 시 ₩{(remaining - projectedRemaining).toLocaleString("ko-KR")}{" "}
          차감)
        </p>
      )}
    </div>
  );
}

// Tweens a displayed number toward `target`. Short duration (~400ms) so the
// counter feels responsive on every +/- tap rather than lagging behind.
function useAnimatedNumber(target: number): number {
  const [n, setN] = useState(target);
  const startRef = useRef(target);
  useEffect(() => {
    const from = startRef.current;
    if (from === target) return;
    const dur = 400;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (target - from) * eased);
      setN(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else startRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return n;
}

function WinCelebrationModal({
  valueName,
  amount,
  onClose,
}: {
  valueName: string;
  amount: number;
  onClose: () => void;
}) {
  // Dynamic import keeps canvas-confetti out of the initial JS bundle — it's
  // only needed for this celebration moment.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const confetti = (await import("canvas-confetti")).default;
      if (cancelled) return;
      const burst = () =>
        confetti({
          particleCount: 90,
          spread: 75,
          origin: { y: 0.35 },
          colors: ["#f97316", "#fbbf24", "#34d399", "#60a5fa", "#f472b6"],
        });
      burst();
      const t1 = setTimeout(burst, 350);
      const t2 = setTimeout(burst, 700);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    })();
    const auto = setTimeout(onClose, 3000);
    return () => {
      cancelled = true;
      clearTimeout(auto);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-2xl text-center animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-5xl mb-3">🏆</p>
        <p className="text-2xl font-extrabold text-emerald-600">낙찰 성공!</p>
        <p className="mt-3 text-base text-gray-800">
          <b>{valueName}</b>을 낙찰받으셨어요!
        </p>
        <p className="mt-2 text-sm text-gray-500">
          낙찰가:{" "}
          <b className="text-gray-900 tabular-nums">
            ₩{amount.toLocaleString("ko-KR")}
          </b>
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 text-sm"
        >
          확인
        </button>
      </div>
    </div>
  );
}

