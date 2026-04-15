"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LeaderFeedbackCard from "@/components/LeaderFeedbackCard";
import ResultReveal from "@/components/ResultReveal";
import { computeWinner, formatWinnerReason } from "@/lib/auction";
import { formatKoreanAmount } from "@/lib/koreanAmount";
import { getSupabaseClient } from "@/lib/supabase";
import {
  type AuctionRow,
  type AuctionResultData,
  type Content,
} from "@/lib/types";
import { useAuctionState } from "@/lib/useAuctionState";
import { useParticipants } from "@/lib/useParticipants";
import { useReactions } from "@/lib/useReactions";
import { useResult } from "@/lib/useResult";

// Default values carried in the 가치관 경매 guide. Pre-populating rows keeps
// entry quick for the leader.
const DEFAULT_VALUES = [
  "사랑",
  "우정",
  "자유",
  "성공",
  "건강",
  "가족",
  "믿음",
  "즐거움",
  "안정",
  "성장",
];

interface EntryRow {
  value_name: string;
  winner_nickname: string;
  amount: string; // string while editing; parsed on submit
}

function makeInitialRows(): EntryRow[] {
  return DEFAULT_VALUES.map((v) => ({
    value_name: v,
    winner_nickname: "",
    amount: "",
  }));
}

export default function LeaderResultPage({
  params,
}: {
  params: { roomCode: string };
}) {
  const roomCode = params.roomCode.toUpperCase();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);

  const [rows, setRows] = useState<EntryRow[]>(() => makeInitialRows());
  const [manualWinner, setManualWinner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const participants = useParticipants(sessionId);
  const reactions = useReactions(sessionId);
  const { result, loaded: resultLoaded } = useResult(sessionId);
  const { state: auctionState, loaded: auctionLoaded } =
    useAuctionState(sessionId);

  // Once the live auction state arrives, replace the blank default rows with
  // the awards already recorded during the live phase. Gate on default-shaped
  // rows so leaders who start editing don't lose their work.
  const [hydratedFromAuction, setHydratedFromAuction] = useState(false);
  useEffect(() => {
    if (!auctionLoaded || hydratedFromAuction) return;
    const awardedValues = auctionState.values.filter(
      (v) => auctionState.awarded[v.id],
    );
    if (awardedValues.length === 0) return;
    const nextRows: EntryRow[] = awardedValues.map((v) => {
      const a = auctionState.awarded[v.id];
      return {
        value_name: v.name,
        winner_nickname: a.winner_nickname,
        amount: String(a.amount),
      };
    });
    setRows(nextRows);
    setHydratedFromAuction(true);
  }, [auctionLoaded, auctionState, hydratedFromAuction]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase
      .from("sessions")
      .select("id, content:contents(*)")
      .eq("room_code", roomCode)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setNotFound(true);
        } else {
          setSessionId(data.id);
          setContent(data.content as unknown as Content);
        }
        setLoadingSession(false);
      });
  }, [roomCode]);

  const normalizedRows: AuctionRow[] = useMemo(
    () =>
      rows
        .filter((r) => r.winner_nickname.trim() && r.amount.trim())
        .map((r) => ({
          value_name: r.value_name.trim(),
          winner_nickname: r.winner_nickname.trim(),
          amount: Number(r.amount) || 0,
        })),
    [rows],
  );

  const computation = useMemo(
    () => computeWinner(normalizedRows),
    [normalizedRows],
  );

  function updateRow(i: number, patch: Partial<EntryRow>) {
    setRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    );
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { value_name: "", winner_nickname: "", amount: "" },
    ]);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handlePublish() {
    if (!sessionId) return;
    setSubmitError(null);

    if (normalizedRows.length === 0) {
      setSubmitError("낙찰 기록을 한 건 이상 입력해주세요");
      return;
    }

    const winner = computation.unambiguous ?? manualWinner;
    if (!winner) {
      setSubmitError("우승자를 선택해주세요");
      return;
    }

    const manualPick =
      computation.candidates.length > 1 || computation.unambiguous === null;

    const resultData: AuctionResultData = {
      rows: normalizedRows,
      tie_manual_pick: manualPick,
    };

    setSubmitting(true);
    const supabase = getSupabaseClient();

    const { error: insertError } = await supabase.from("results").insert({
      session_id: sessionId,
      winner_nickname: winner,
      winner_reason: formatWinnerReason(winner, computation.stats, manualPick),
      result_data: resultData,
    });

    if (insertError) {
      setSubmitError(insertError.message);
      setSubmitting(false);
      return;
    }

    // Clear any stale sharing state so the reveal screen starts with the
    // ladder-pick flow instead of a pre-seeded random order.
    await supabase
      .from("sessions")
      .update({
        status: "result",
        sharing_order: null,
        sharing_index: 0,
        sharing_ladder: null,
      })
      .eq("id", sessionId);

    setSubmitting(false);
    // useResult will pick up the INSERT via realtime and flip to reveal mode
  }

  if (loadingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center text-gray-400">
        불러오는 중…
      </main>
    );
  }

  if (notFound || !content || !sessionId) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-3">❓</div>
        <p className="font-semibold mb-1">방을 찾을 수 없어요</p>
        <p className="text-sm text-gray-500 mb-6">룸코드: {roomCode}</p>
        <Link
          href="/leader/filter"
          className="rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3 text-sm"
        >
          새 방 만들기
        </Link>
      </main>
    );
  }

  // Reveal mode: result has been published (by us or already existed).
  if (result) {
    return (
      <main className="min-h-screen px-5 pt-6 pb-12 max-w-xl mx-auto">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
        >
          ← 홈
        </Link>
        <div className="mt-4">
          <ResultReveal
            content={content}
            result={result}
            sessionId={sessionId}
            participants={participants}
            auctionState={auctionState}
            myParticipantId={null}
            isLeader
          />
        </div>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            🎯 팀 피드백 저장
          </h2>
          <LeaderFeedbackCard
            participants={participants}
            reactions={reactions}
            auctionState={auctionState}
          />
        </section>
      </main>
    );
  }

  const topStats = computation.stats.slice(0, 5);

  return (
    <main className="min-h-screen px-5 pt-6 pb-40 max-w-xl mx-auto">
      <Link
        href={`/leader/play/${roomCode}`}
        className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
      >
        ← 진행 화면
      </Link>

      <header className="mt-3 mb-5">
        <h1 className="text-2xl font-bold">결과 입력</h1>
        <p className="mt-1 text-sm text-gray-500">
          낙찰된 가치관과 금액을 기록해주세요. 빈 행은 자동으로 제외돼요.
        </p>
      </header>

      <section className="space-y-2">
        {rows.map((r, i) => (
          <div
            key={i}
            className="rounded-2xl bg-white border border-gray-200 p-3"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={r.value_name}
                onChange={(e) => updateRow(i, { value_name: e.target.value })}
                placeholder="가치관"
                className="w-24 rounded-lg border border-gray-200 px-2 py-2 text-sm font-medium text-center"
              />
              <select
                value={r.winner_nickname}
                onChange={(e) =>
                  updateRow(i, { winner_nickname: e.target.value })
                }
                className="flex-1 min-w-0 rounded-lg border border-gray-200 px-2 py-2 text-sm bg-white"
              >
                <option value="">낙찰자 선택</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.nickname}>
                    {p.nickname}
                  </option>
                ))}
              </select>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium pointer-events-none">
                  ₩
                </span>
                <input
                  type="number"
                  min={0}
                  step={1_000_000}
                  value={r.amount}
                  onChange={(e) => updateRow(i, { amount: e.target.value })}
                  placeholder="금액"
                  className="w-32 rounded-lg border border-gray-200 pl-6 pr-2 py-2 text-sm text-right tabular-nums"
                />
              </div>
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label="행 삭제"
                className="shrink-0 w-8 h-8 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </section>

      <button
        type="button"
        onClick={addRow}
        className="mt-3 w-full rounded-xl border-2 border-dashed border-gray-300 hover:border-brand-400 hover:text-brand-600 text-gray-500 py-3 text-sm font-medium"
      >
        + 행 추가
      </button>

      <section className="mt-7 rounded-2xl bg-white border border-gray-200 p-4">
        <h2 className="text-sm font-semibold mb-3">🏆 우승자 계산</h2>
        {computation.stats.length === 0 ? (
          <p className="text-sm text-gray-400">
            낙찰 정보를 입력하면 자동으로 계산돼요
          </p>
        ) : (
          <>
            <ul className="space-y-1 text-sm">
              {topStats.map((s, i) => (
                <li
                  key={s.nickname}
                  className={[
                    "flex items-center justify-between px-2 py-1.5 rounded",
                    i === 0 ? "bg-brand-50 text-brand-700 font-semibold" : "",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={[
                        "inline-flex items-center justify-center min-w-[2rem]",
                        i < 3 ? "text-xl" : "text-xs text-gray-500",
                      ].join(" ")}
                    >
                      {i === 0
                        ? "🥇"
                        : i === 1
                          ? "🥈"
                          : i === 2
                            ? "🥉"
                            : `${i + 1}위`}
                    </span>
                    <span>{s.nickname}</span>
                  </span>
                  <span className="text-xs text-gray-500 tabular-nums">
                    {s.count}개 · {formatKoreanAmount(s.totalAmount)}
                  </span>
                </li>
              ))}
            </ul>

            {computation.unambiguous ? (
              <p className="mt-3 text-sm text-brand-700">
                우승자: <b>{computation.unambiguous}</b>
              </p>
            ) : (
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
                <p className="text-sm text-amber-900 font-medium mb-2">
                  동률입니다. 리더가 직접 선택해주세요.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {computation.candidates.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setManualWinner(name)}
                      className={[
                        "rounded-full px-3 py-1.5 text-sm border",
                        manualWinner === name
                          ? "bg-brand-500 text-white border-brand-500"
                          : "bg-white text-gray-700 border-gray-300",
                      ].join(" ")}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {submitError && (
        <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {submitError}
        </p>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-200 px-5 py-4">
        <div className="max-w-xl mx-auto">
          <button
            type="button"
            onClick={handlePublish}
            disabled={submitting || !resultLoaded}
            className="w-full rounded-2xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold py-4 text-base shadow-sm transition disabled:opacity-50"
          >
            {submitting ? "공개 중…" : "팀원에게 공개하기 🎉"}
          </button>
        </div>
      </div>
    </main>
  );
}
