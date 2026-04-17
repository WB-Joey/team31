"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AuctionSelectionPanel from "./AuctionSelectionPanel";
import SlotMachine from "./SlotMachine";
import {
  auctionHasCommitted,
  auctionHasStarted,
  nextUnrevealedValue,
  spinElapsedMs,
  unrevealedValues,
} from "@/lib/auctionState";
import { remainingBudgetFromBids } from "@/lib/budget";
import { formatKoreanAmount } from "@/lib/koreanAmount";
import { getSupabaseClient } from "@/lib/supabase";
import type {
  AuctionState,
  AuctionValue,
  AwardedEntry,
  MemberBid,
} from "@/lib/types";
import type { Participant } from "@/lib/useParticipants";

const SPIN_DURATION_MS = 3000;

interface Props {
  sessionId: string;
  state: AuctionState;
  participants: Participant[];
}

export default function LeaderAuctionBoard({
  sessionId,
  state,
  participants,
}: Props) {
  const started = auctionHasStarted(state);
  const committed = auctionHasCommitted(state);

  const [reselecting, setReselecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nicknameModalOpen, setNicknameModalOpen] = useState(false);

  // Award form state, scoped to the current item
  const [awardName, setAwardName] = useState<string>("");
  const [awardAmount, setAwardAmount] = useState<string>("");
  // Tracks whether leader has manually edited the award form for the current
  // value. While false, the form auto-mirrors the top bidder.
  const [awardDirty, setAwardDirty] = useState(false);

  // Local spin animation clock. We track spin end client-side so the reveal
  // lands synchronously with the animation even if the DB's `spin` field
  // lingers briefly while we clear it.
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

  // Leader is authoritative for cleaning up the spin field once it ends.
  // Uses a ref for the latest state so the clear-write preserves concurrent
  // updates (e.g., a new participant joining).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    if (!state.spin) return;
    const elapsed = spinElapsedMs(state.spin);
    const remaining = Math.max(0, state.spin.duration_ms - elapsed) + 150;
    const t = setTimeout(async () => {
      // Double-check the spin hasn't already been cleared by a re-entrant run
      if (!stateRef.current.spin) return;
      const supabase = getSupabaseClient();
      await supabase
        .from("sessions")
        .update({
          auction_state: { ...stateRef.current, spin: null },
        })
        .eq("id", sessionId);
    }, remaining);
    return () => clearTimeout(t);
  }, [state.spin?.winner_id, state.spin?.started_at, sessionId]);

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

  const upcoming = useMemo(() => nextUnrevealedValue(state), [state]);
  const unrevealedPool = useMemo(() => unrevealedValues(state), [state]);

  const awardedList = useMemo(() => {
    return state.values
      .map((v) => {
        const a = state.awarded[v.id];
        return a ? { value: v, award: a } : null;
      })
      .filter(
        (x): x is { value: AuctionValue; award: AwardedEntry } => x !== null,
      )
      .sort((a, b) => b.award.awarded_at.localeCompare(a.award.awarded_at));
  }, [state]);

  const currentBidders = useMemo(() => {
    if (!currentValue) return [];
    const list: { participant: Participant; bid: MemberBid }[] = [];
    for (const p of participants) {
      if (p.is_leader) continue;
      const bid = p.bids.find(
        (b) => b.value_id === currentValue.id && b.status === "bidding",
      );
      if (bid) list.push({ participant: p, bid });
    }
    list.sort((a, b) => b.bid.amount - a.bid.amount);
    return list;
  }, [currentValue, participants]);

  // Reset the award form every time a new value takes the stage.
  useEffect(() => {
    setAwardDirty(false);
    setAwardName("");
    setAwardAmount("");
  }, [currentValue?.id]);

  // While the leader hasn't manually edited the form, mirror the current top
  // bidder so 낙찰 확정 is a single tap when there's a clear 1위.
  useEffect(() => {
    if (awardDirty) return;
    if (!currentValue) return;
    if (currentBidders.length === 0) return;
    const top = currentBidders[0];
    setAwardName(top.participant.nickname);
    setAwardAmount(String(top.bid.amount));
  }, [awardDirty, currentValue, currentBidders]);

  function handleAwardNameChange(v: string) {
    setAwardDirty(true);
    setAwardName(v);
  }
  function handleAwardAmountChange(v: string) {
    setAwardDirty(true);
    setAwardAmount(v);
  }

  const pendingList = useMemo(() => {
    const revealed = new Set(state.revealed_ids);
    return state.values.filter(
      (v) => !revealed.has(v.id) && v.id !== state.current_id,
    );
  }, [state]);

  async function saveState(next: AuctionState) {
    setSaving(true);
    setError(null);
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("sessions")
      .update({ auction_state: next })
      .eq("id", sessionId);
    setSaving(false);
    if (error) {
      setError(error.message);
      return false;
    }
    return true;
  }

  async function commitSelection(values: AuctionValue[]) {
    const ok = await saveState({ ...state, values });
    if (ok) setReselecting(false);
  }

  async function handleRevealNext() {
    if (!upcoming) return;
    await saveState({ ...state, current_id: upcoming.id });
  }

  async function handleRandomPick() {
    if (unrevealedPool.length === 0) return;
    const winner =
      unrevealedPool[Math.floor(Math.random() * unrevealedPool.length)];
    await saveState({
      ...state,
      current_id: winner.id,
      spin: {
        winner_id: winner.id,
        started_at: new Date().toISOString(),
        duration_ms: SPIN_DURATION_MS,
      },
    });
  }

  // Resolve all 'bidding' entries on the given value for every participant —
  // winner's bid becomes 'won', everyone else 'lost'. Runs BEFORE the state
  // write so member clients see 낙찰/실패 transitions on the card they're
  // still looking at.
  async function resolveBidsForValue(
    valueId: string,
    winnerNickname: string | null,
  ) {
    const supabase = getSupabaseClient();
    const updates = participants
      .filter((p) =>
        p.bids.some(
          (b) => b.value_id === valueId && b.status === "bidding",
        ),
      )
      .map((p) => {
        const nextBids: MemberBid[] = p.bids.map((b) => {
          if (b.value_id !== valueId || b.status !== "bidding") return b;
          const isWinner =
            winnerNickname !== null && p.nickname === winnerNickname;
          return { ...b, status: isWinner ? "won" : "lost" };
        });
        return supabase
          .from("participants")
          .update({
            bids: nextBids,
            remaining_budget: remainingBudgetFromBids(nextBids),
          })
          .eq("id", p.id);
      });
    if (updates.length > 0) await Promise.all(updates);
  }

  async function handleAward() {
    if (!currentValue) return;
    if (!awardName) {
      setNicknameModalOpen(true);
      return;
    }
    const amount = Number(awardAmount);
    if (!awardAmount.trim() || Number.isNaN(amount) || amount < 0) {
      setError("낙찰 금액을 입력해주세요");
      return;
    }

    setError(null);
    // Resolve participant bids first so the transition banner fires while the
    // current card is still visible on member screens.
    await resolveBidsForValue(currentValue.id, awardName);

    const next: AuctionState = {
      ...state,
      awarded: {
        ...state.awarded,
        [currentValue.id]: {
          winner_nickname: awardName,
          amount,
          awarded_at: new Date().toISOString(),
        },
      },
      revealed_ids: state.revealed_ids.includes(currentValue.id)
        ? state.revealed_ids
        : [...state.revealed_ids, currentValue.id],
      current_id: null,
    };
    const ok = await saveState(next);
    if (ok) {
      setAwardName("");
      setAwardAmount("");
    }
  }

  async function handleSkip() {
    if (!currentValue) return;
    // Refund all bidders — no winner
    await resolveBidsForValue(currentValue.id, null);

    const next: AuctionState = {
      ...state,
      revealed_ids: state.revealed_ids.includes(currentValue.id)
        ? state.revealed_ids
        : [...state.revealed_ids, currentValue.id],
      current_id: null,
    };
    await saveState(next);
  }

  async function handleEnd() {
    if (!confirm("경매를 종료할까요? 더 이상 공개할 수 없어요.")) return;
    await saveState({ ...state, ended: true, current_id: null });
  }

  // --- Ended ---------------------------------------------------------------

  if (state.ended) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-5 text-center">
        <div className="text-4xl mb-2">🏁</div>
        <p className="font-semibold">경매가 종료되었어요</p>
        <p className="mt-1 text-sm text-gray-500">
          아래 &quot;결과 입력하기&quot; 버튼으로 넘어가주세요
        </p>
        <div className="mt-4 text-sm text-gray-600">
          낙찰 {awardedList.length}건 · 공개 {state.revealed_ids.length}건
        </div>
      </div>
    );
  }

  // --- Selection phase -----------------------------------------------------

  if (!committed || reselecting) {
    return (
      <AuctionSelectionPanel
        initial={state.values}
        saving={saving}
        participants={participants}
        onCommit={commitSelection}
        onCancel={reselecting ? () => setReselecting(false) : undefined}
      />
    );
  }

  // --- Live phase ----------------------------------------------------------

  // While spinning, replace the current card with the slot machine. Leader
  // can't interact with the award form until the reveal lands.
  if (spinActive && spinWinner && state.spin) {
    const elapsed = spinElapsedMs(state.spin);
    const remaining = Math.max(0, state.spin.duration_ms - elapsed);
    return (
      <div className="space-y-4">
        <SlotMachine
          winner={spinWinner}
          pool={unrevealedPool.length > 0 ? unrevealedPool : [spinWinner]}
          durationMs={remaining}
        />
        <p className="text-xs text-gray-500 text-center">
          팀원 화면에도 같은 애니메이션이 재생되고 있어요
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current item card */}
      {currentValue ? (
        <CurrentCard
          value={currentValue}
          participants={participants}
          bidders={currentBidders}
          awardName={awardName}
          awardAmount={awardAmount}
          onAwardName={handleAwardNameChange}
          onAwardAmount={handleAwardAmountChange}
          onAward={handleAward}
          onSkip={handleSkip}
          saving={saving}
        />
      ) : upcoming ? (
        <UpcomingCard
          value={upcoming}
          onReveal={handleRevealNext}
          onRandomPick={handleRandomPick}
          canRandomPick={unrevealedPool.length > 0}
          saving={saving}
        />
      ) : (
        <div className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white p-5 text-center">
          <p className="opacity-90">모든 항목을 공개했어요</p>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {!started && (
        <button
          type="button"
          onClick={() => setReselecting(true)}
          className="w-full rounded-xl border border-dashed border-gray-300 hover:border-brand-400 hover:text-brand-600 text-gray-500 py-3 text-sm font-medium"
        >
          ← 목록 다시 선택
        </button>
      )}

      {awardedList.length > 0 && (
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <h3 className="text-sm font-semibold mb-2">
            ✅ 낙찰 완료 ({awardedList.length})
          </h3>
          <ul className="space-y-1.5">
            {awardedList.map(({ value, award }) => (
              <li
                key={value.id}
                className="flex items-center justify-between gap-2 text-sm px-2 py-1.5 rounded-lg bg-gray-50"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span>{value.category_emoji}</span>
                  <span className="font-medium truncate">{value.name}</span>
                </span>
                <span className="text-gray-600 tabular-nums shrink-0">
                  {award.winner_nickname} · {formatKoreanAmount(award.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingList.length > 0 && (
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <h3 className="text-sm font-semibold mb-2">
            🗂 남은 항목 ({pendingList.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {pendingList.map((v) => (
              <span
                key={v.id}
                className="text-xs rounded-full px-2.5 py-1 border bg-gray-100 text-gray-700 border-transparent"
              >
                {v.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {started && !state.ended && (
        <button
          type="button"
          onClick={handleEnd}
          disabled={saving}
          className="w-full rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 text-sm disabled:opacity-60"
        >
          경매 종료 🏁
        </button>
      )}

      {nicknameModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={() => setNicknameModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-lg font-bold text-center">
              ⚠️ 낙찰자를 선택해주세요
            </p>
            <p className="mt-2 text-sm text-gray-600 text-center">
              낙찰자를 드롭다운에서 먼저 선택한 후 확정해주세요.
            </p>
            <button
              type="button"
              onClick={() => setNicknameModalOpen(false)}
              className="mt-5 w-full rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 text-sm"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Subcomponents -------------------------------------------------------

function UpcomingCard({
  value,
  onReveal,
  onRandomPick,
  canRandomPick,
  saving,
}: {
  value: AuctionValue;
  onReveal: () => void;
  onRandomPick: () => void;
  canRandomPick: boolean;
  saving: boolean;
}) {
  return (
    <div className="rounded-2xl text-white p-5 shadow-sm bg-gradient-to-br from-brand-500 to-brand-600">
      <p className="text-xs opacity-80">다음 항목</p>
      <div className="mt-2 flex items-start gap-3">
        <span className="text-3xl">{value.category_emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs opacity-80">{value.category}</p>
          <p className="text-2xl font-bold">{value.name}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onReveal}
          disabled={saving}
          className="rounded-xl font-semibold py-3 disabled:opacity-60 bg-white text-brand-700"
        >
          공개하기 🎁
        </button>
        <button
          type="button"
          onClick={onRandomPick}
          disabled={saving || !canRandomPick}
          className="rounded-xl bg-white/20 hover:bg-white/30 font-semibold py-3 disabled:opacity-40"
        >
          🎰 랜덤 뽑기
        </button>
      </div>
    </div>
  );
}

function CurrentCard({
  value,
  participants,
  bidders,
  awardName,
  awardAmount,
  onAwardName,
  onAwardAmount,
  onAward,
  onSkip,
  saving,
}: {
  value: AuctionValue;
  participants: Participant[];
  bidders: { participant: Participant; bid: MemberBid }[];
  awardName: string;
  awardAmount: string;
  onAwardName: (v: string) => void;
  onAwardAmount: (v: string) => void;
  onAward: () => void;
  onSkip: () => void;
  saving: boolean;
}) {
  const top3 = bidders.slice(0, 3);
  const previewAmount = Number(awardAmount) || 0;

  const selectedBidder = awardName
    ? bidders.find((b) => b.participant.nickname === awardName)
    : null;
  const hasTie =
    !!selectedBidder &&
    bidders.some(
      (b) =>
        b.participant.nickname !== awardName &&
        b.bid.amount === selectedBidder.bid.amount,
    );

  return (
    <div className="rounded-2xl text-white p-5 shadow-sm animate-pop-in bg-gradient-to-br from-brand-500 to-brand-600">
      <p className="text-xs opacity-80">지금 공개 중</p>
      <div className="mt-2 flex items-start gap-3">
        <span className="text-3xl">{value.category_emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs opacity-80">{value.category}</p>
          <p className="text-3xl font-bold">{value.name}</p>
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-white/15 backdrop-blur-sm p-3">
        <p className="text-xs font-semibold opacity-90 mb-2">
          💰 현재 입찰 현황
        </p>
        {bidders.length === 0 ? (
          <p className="py-3 text-center text-xs opacity-80">
            아직 입찰자가 없어요
          </p>
        ) : (
          <ul className="space-y-1">
            {top3.map(({ participant, bid }, i) => (
              <li
                key={participant.id}
                className={[
                  "flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm",
                  i === 0
                    ? "bg-white text-gray-900 font-semibold"
                    : "bg-white/20 text-white",
                ].join(" ")}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="shrink-0">
                    {i === 0 ? "👑 1위" : i === 1 ? "2위" : "3위"}
                  </span>
                  <span className="truncate">{participant.nickname}</span>
                </span>
                <span className="tabular-nums text-xs shrink-0">
                  {formatKoreanAmount(bid.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] opacity-85 text-center">
          ✋ 총 {bidders.length}명 입찰 중
        </p>
      </div>

      <div className="mt-3 space-y-2">
        <select
          value={awardName}
          onChange={(e) => onAwardName(e.target.value)}
          className="w-full rounded-lg px-3 py-2.5 text-sm bg-white text-gray-900"
        >
          <option value="">낙찰자 선택</option>
          {participants.map((p) => (
            <option key={p.id} value={p.nickname}>
              {p.nickname}
            </option>
          ))}
        </select>
        <div className="rounded-xl bg-white p-3">
          <p className="text-[11px] text-gray-500 font-medium mb-2 text-center">
            낙찰 금액
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const cur = Number(awardAmount) || 0;
                const next = Math.max(0, cur - 1_000_000);
                onAwardAmount(String(next));
              }}
              className="shrink-0 w-14 h-14 rounded-full text-3xl font-black shadow-sm flex items-center justify-center select-none text-white bg-brand-500 hover:bg-brand-600 active:bg-brand-700"
              aria-label="감소"
            >
              −
            </button>
            <div className="flex-1 relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base text-gray-500 font-semibold pointer-events-none">
                ₩
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1_000_000}
                value={awardAmount}
                onChange={(e) => onAwardAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg pl-8 pr-2 py-3 text-2xl font-extrabold text-gray-900 text-center tabular-nums bg-gray-50 border border-gray-200 focus:border-brand-400 outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const cur = Number(awardAmount) || 0;
                onAwardAmount(String(cur + 1_000_000));
              }}
              className="shrink-0 w-14 h-14 rounded-full text-3xl font-black shadow-sm flex items-center justify-center select-none text-white bg-brand-500 hover:bg-brand-600 active:bg-brand-700"
              aria-label="증가"
            >
              +
            </button>
          </div>
          <p className="mt-2 text-xs font-semibold text-gray-700 text-center tabular-nums">
            = {formatKoreanAmount(previewAmount)}
          </p>
          <p className="mt-0.5 text-[10px] text-gray-400 text-center">
            100만원 단위
          </p>
        </div>
        {hasTie && (
          <div className="rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 text-center">
            <p className="text-xs font-semibold text-amber-800">
              ⚠️ 동일한 입찰금액이 있어요!
            </p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              팀원들이 금액을 조정할 때까지 기다려주세요.
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAward}
            disabled={saving || hasTie}
            className={[
              "flex-1 rounded-xl font-semibold py-2.5 disabled:opacity-60",
              hasTie
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-white text-brand-700",
            ].join(" ")}
          >
            낙찰 확정
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={saving}
            className="rounded-xl bg-white/20 hover:bg-white/30 font-medium px-4 disabled:opacity-60"
          >
            유찰
          </button>
        </div>
      </div>
    </div>
  );
}

