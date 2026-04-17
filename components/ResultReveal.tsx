"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import LadderModal from "./LadderModal";
import SharingGuide from "./SharingGuide";
import { computeWinner } from "@/lib/auction";
import { getSupabaseClient } from "@/lib/supabase";
import {
  REACTIONS,
  type AuctionState,
  type Content,
  type ReactionKey,
  type SessionResult,
  type SharingLadder,
} from "@/lib/types";
import type { Encouragement } from "@/lib/useEncouragements";
import type { Reaction } from "@/lib/useReactions";
import { useSharingState } from "@/lib/useSharingState";
import type { Participant } from "@/lib/useParticipants";

interface Props {
  content: Content;
  result: SessionResult;
  sessionId: string;
  participants: Participant[];
  auctionState: AuctionState;
  myParticipantId: string | null;
  isLeader: boolean;
  // Reactions and encouragements are subscribed by the parent page so the
  // leader screen doesn't open a duplicate channel for the LeaderFeedbackCard.
  reactions: Reaction[];
  encouragements: Encouragement[];
}

// Confetti emoji positions — fixed so the animation is consistent across renders.
const CONFETTI = [
  { emoji: "🎉", left: "8%", delay: "0s", duration: "4.2s" },
  { emoji: "✨", left: "22%", delay: "0.6s", duration: "5s" },
  { emoji: "🎊", left: "40%", delay: "0.2s", duration: "4.5s" },
  { emoji: "⭐", left: "58%", delay: "0.9s", duration: "5.3s" },
  { emoji: "🎉", left: "74%", delay: "0.4s", duration: "4.7s" },
  { emoji: "✨", left: "88%", delay: "1.1s", duration: "5.1s" },
];

function rankBadge(index: number): string {
  if (index === 0) return "🥇";
  if (index === 1) return "🥈";
  if (index === 2) return "🥉";
  return `${index + 1}위`;
}

export default function ResultReveal({
  result,
  sessionId,
  participants,
  auctionState,
  myParticipantId,
  isLeader,
  reactions,
  encouragements,
}: Props) {
  const sharing = useSharingState(sessionId);

  const rows = result.result_data?.rows ?? [];
  const stats = useMemo(() => computeWinner(rows).stats, [rows]);

  const [reactionError, setReactionError] = useState<string | null>(null);

  // Reactions + encouragements are keyed by nickname on the server schema.
  // Derive the current participant's nickname from the live roster.
  const myNickname = useMemo<string | null>(() => {
    if (!myParticipantId) return null;
    return participants.find((p) => p.id === myParticipantId)?.nickname ?? null;
  }, [participants, myParticipantId]);

  // "My selected emoji" is tracked purely in this device's localStorage so
  // two tabs on the same browser (or a nickname collision on the server)
  // can't cause player A's highlight to appear on player B's screen.
  const myReactionKey = `my_reaction_${sessionId}`;
  const [myReaction, setMyReaction] = useState<ReactionKey | null>(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(myReactionKey);
      if (raw === "thumbs_up" || raw === "laugh" || raw === "fire" || raw === "sad") {
        setMyReaction(raw);
      }
    } catch {
      // Ignore
    }
  }, [myReactionKey]);

  // DB-derived counts, session-scoped via the useReactions subscription.
  const dbReactionCounts = useMemo(() => {
    const out: Record<ReactionKey, number> = {
      thumbs_up: 0,
      laugh: 0,
      fire: 0,
      sad: 0,
    };
    for (const r of reactions) out[r.emoji]++;
    return out;
  }, [reactions]);

  // Display counts are monotonic-by-emoji: they merge optimistic clicks
  // with whatever DB reports. They never decrease — when the DB stream is
  // delayed or returns stale data we keep the higher value rather than
  // letting the UI snap down to 0 between optimistic update and poll.
  const [displayCounts, setDisplayCounts] = useState<Record<ReactionKey, number>>({
    thumbs_up: 0,
    laugh: 0,
    fire: 0,
    sad: 0,
  });
  useEffect(() => {
    setDisplayCounts((prev) => ({
      thumbs_up: Math.max(prev.thumbs_up, dbReactionCounts.thumbs_up),
      laugh: Math.max(prev.laugh, dbReactionCounts.laugh),
      fire: Math.max(prev.fire, dbReactionCounts.fire),
      sad: Math.max(prev.sad, dbReactionCounts.sad),
    }));
  }, [dbReactionCounts]);
  const reactionCounts = displayCounts;

  async function toggleReaction(emoji: ReactionKey) {
    if (!myParticipantId || !myNickname) {
      console.error(
        "[reactions] toggle skipped — missing identity",
        { myParticipantId, myNickname },
      );
      return;
    }
    const next: ReactionKey | null = myReaction === emoji ? null : emoji;
    // Optimistic local update + localStorage persistence. Highlight state
    // never reads from DB, so no other player's click can affect my UI.
    setMyReaction(next);
    try {
      if (next) window.localStorage.setItem(myReactionKey, next);
      else window.localStorage.removeItem(myReactionKey);
    } catch {
      // Ignore
    }
    // Optimistic count bump for the chosen emoji — counts are monotonic
    // (see displayCounts effect) so this can only ever climb, never snap
    // down, even if the DB poll temporarily returns a smaller number.
    if (next) {
      setDisplayCounts((prev) => ({ ...prev, [next]: prev[next] + 1 }));
    }
    setReactionError(null);

    const supabase = getSupabaseClient();
    try {
      const { error: delError } = await supabase
        .from("reactions")
        .delete()
        .eq("session_id", sessionId)
        .eq("participant_nickname", myNickname);
      if (delError) {
        console.error("[reactions] delete failed", delError);
        throw delError;
      }

      if (next) {
        const { error } = await supabase.from("reactions").insert({
          session_id: sessionId,
          participant_nickname: myNickname,
          emoji: next,
        });
        if (error) {
          console.error("[reactions] insert failed", error);
          throw error;
        }
      }
    } catch (e) {
      console.error("[reactions] toggle failed", e);
      setReactionError(
        `반응을 저장하지 못했어요 (${(e as { message?: string })?.message ?? "unknown"})`,
      );
    }
  }

  // Encouragement messages — 1 per participant, freeform text.
  // "Already sent" is tracked in this device's localStorage so a server-side
  // nickname collision (two browsers resolving to the same identity) can't
  // make every player's input box collapse the moment one player sends.
  const messageSentKey = `encouragement_sent_${sessionId}`;
  const [messageDraft, setMessageDraft] = useState("");
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendAnonymously, setSendAnonymously] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(messageSentKey);
      if (raw) setSentMessage(raw);
    } catch {
      // Ignore
    }
  }, [messageSentKey]);

  async function sendMessage() {
    if (!myParticipantId || !myNickname) {
      console.error(
        "[encouragements] send skipped — missing identity",
        { myParticipantId, myNickname },
      );
      return;
    }
    if (sentMessage) return;
    const trimmed = messageDraft.trim();
    if (!trimmed) return;
    setSending(true);
    setMessageError(null);

    const supabase = getSupabaseClient();
    try {
      // No DELETE first — multiple players may legitimately share a nickname
      // resolution on this device, so we never want to wipe somebody else's
      // message. INSERT only.
      const { error } = await supabase.from("encouragements").insert({
        session_id: sessionId,
        participant_nickname: sendAnonymously ? "익명" : myNickname,
        message: trimmed,
      });
      if (error) {
        console.error("[encouragements] insert failed", error);
        throw error;
      }
      setSentMessage(trimmed);
      try {
        window.localStorage.setItem(messageSentKey, trimmed);
      } catch {
        // Ignore
      }
    } catch (e) {
      console.error("[encouragements] send failed", e);
      setMessageError(
        `메시지를 전달하지 못했어요 (${(e as { message?: string })?.message ?? "unknown"})`,
      );
    } finally {
      setSending(false);
    }
  }

  function resendMessage() {
    setSentMessage(null);
    setMessageDraft("");
    setMessageError(null);
    try {
      window.localStorage.removeItem(messageSentKey);
    } catch {
      // Ignore
    }
  }

  // Map participant id → nickname for sharing order rendering
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of participants) m.set(p.id, p.nickname);
    return m;
  }, [participants]);

  const nonLeaderParticipants = useMemo(
    () => participants.filter((p) => !p.is_leader),
    [participants],
  );

  const sharingOrder = sharing.order ?? [];
  const currentSpeakerId =
    sharingOrder.length > 0 ? sharingOrder[sharing.index] ?? null : null;
  const currentSpeaker = useMemo(
    () =>
      currentSpeakerId
        ? participants.find((p) => p.id === currentSpeakerId) ?? null
        : null,
    [currentSpeakerId, participants],
  );
  const sharingDone =
    sharingOrder.length >= nonLeaderParticipants.length &&
    nonLeaderParticipants.length > 0;
  const ladder = sharing.ladder;
  const spokenSet = useMemo(() => new Set(sharingOrder), [sharingOrder]);
  const remainingSpeakers = nonLeaderParticipants.filter(
    (p) => !spokenSet.has(p.id),
  );

  const isMyTurn =
    !!myParticipantId && !!currentSpeakerId && currentSpeakerId === myParticipantId;

  // Pick-next popup for the member who was just chosen. Watches the current
  // speaker id and fires when it transitions to this participant.
  const previousSpeakerRef = useRef<string | null>(null);
  const [pickedPopup, setPickedPopup] = useState<{
    pickerName: string;
  } | null>(null);

  useEffect(() => {
    if (!myParticipantId) return;
    const prev = previousSpeakerRef.current;
    previousSpeakerRef.current = currentSpeakerId;
    if (!currentSpeakerId) return;
    if (prev === currentSpeakerId) return;
    if (currentSpeakerId !== myParticipantId) return;

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch {
        // Silent — vibrate is best-effort.
      }
    }

    // Random (roulette) path: no second popup. The LadderModal already showed
    // the reveal; auto-scroll the picked member to the sharing guide when the
    // modal dismounts (which is what flips currentSpeakerId for them).
    if (sharing.method === "random") {
      requestAnimationFrame(() => {
        document.getElementById("sharing-guide")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
      return;
    }

    // Manual pick: the picker is the previous entry in the sharing order, or
    // the leader if I'm the first speaker.
    const idx = sharing.index;
    const pickerId = idx > 0 ? sharingOrder[idx - 1] : null;
    const pickerName = pickerId ? nameById.get(pickerId) ?? "리더" : "리더";

    setPickedPopup({ pickerName });
  }, [
    currentSpeakerId,
    myParticipantId,
    sharing.index,
    sharing.method,
    sharingOrder,
    nameById,
  ]);

  async function startLadder() {
    if (nonLeaderParticipants.length === 0) return;
    const shuffled = [...nonLeaderParticipants]
      .sort(() => Math.random() - 0.5)
      .map((p) => p.id);
    const winner_id =
      shuffled[Math.floor(Math.random() * shuffled.length)];

    // rungs/rows/start_col are legacy ladder fields kept for type
    // compatibility; the roulette wheel only consumes candidates, winner_id,
    // started_at, and duration_ms.
    const ladderData: SharingLadder = {
      candidates: shuffled,
      rungs: [],
      rows: 0,
      start_col: 0,
      winner_id,
      started_at: new Date().toISOString(),
      duration_ms: 4000,
    };
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("sessions")
      .update({
        sharing_state: {
          order: null,
          index: 0,
          ladder: ladderData,
          method: "random",
        },
      })
      .eq("id", sessionId);
    if (error) console.error("[sharing] startLadder failed", error);
  }

  // Leader commits the ladder winner into sharing_state when they tap [확인]
  // on the modal. The auto-timer that used to do this was removed so members
  // see the result before the modal disappears for everyone.
  async function commitLadderWinner() {
    if (!ladder) return;
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("sessions")
      .update({
        sharing_state: {
          order: [ladder.winner_id],
          index: 0,
          ladder: null,
          method: "random",
        },
      })
      .eq("id", sessionId);
    if (error) console.error("[sharing] ladder commit failed", error);
  }

  async function pickFirstSpeaker(participantId: string) {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("sessions")
      .update({
        sharing_state: {
          order: [participantId],
          index: 0,
          ladder: null,
          method: "manual",
        },
      })
      .eq("id", sessionId);
    if (error) console.error("[sharing] pickFirstSpeaker failed", error);
  }

  async function resetSharing() {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("sessions")
      .update({
        sharing_state: { order: null, index: 0, ladder: null, method: null },
      })
      .eq("id", sessionId);
    if (error) console.error("[sharing] reset failed", error);
  }

  async function pickNextSpeaker(participantId: string) {
    const nextOrder = [...sharingOrder, participantId];
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("sessions")
      .update({
        sharing_state: {
          order: nextOrder,
          index: nextOrder.length - 1,
          ladder: null,
          method: "manual",
        },
      })
      .eq("id", sessionId);
    if (error) console.error("[sharing] pickNextSpeaker failed", error);
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-0">
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            className="absolute top-0 text-3xl animate-float-up"
            style={{
              left: c.left,
              animationDelay: c.delay,
              animationDuration: c.duration,
            }}
          >
            {c.emoji}
          </span>
        ))}
      </div>

      {/* Winner announcement */}
      <section className="relative rounded-3xl bg-gradient-to-br from-amber-400 via-brand-500 to-brand-600 text-white p-7 text-center shadow-lg">
        <p className="text-sm opacity-90 mb-2">🏆 오늘의 우승자</p>
        <h1 className="text-5xl font-extrabold tracking-tight animate-pop-in drop-shadow">
          {result.winner_nickname}
        </h1>
        <p className="mt-3 text-sm opacity-90">{result.winner_reason}</p>
      </section>

      {/* Ranking with medals */}
      {stats.length > 0 && (
        <section className="relative mt-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            🏅 전체 순위
          </h2>
          <ul className="rounded-2xl bg-white border border-gray-200 divide-y divide-gray-100">
            {stats.map((s, i) => (
              <li
                key={s.nickname}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={[
                      "inline-flex items-center justify-center min-w-[2.25rem]",
                      i < 3 ? "text-2xl" : "text-xs text-gray-500",
                    ].join(" ")}
                  >
                    {rankBadge(i)}
                  </span>
                  <span
                    className={[
                      i === 0 ? "font-semibold text-brand-700" : "text-gray-800",
                    ].join(" ")}
                  >
                    {s.nickname}
                  </span>
                </span>
                <span className="text-xs text-gray-500 tabular-nums">
                  {s.count}개 · ₩{s.totalAmount.toLocaleString("ko-KR")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Auction rows */}
      <section className="relative mt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          📜 낙찰 결과 ({rows.length}건)
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">
            입력된 낙찰 기록이 없어요
          </p>
        ) : (
          <ul className="rounded-2xl bg-white border border-gray-200 divide-y divide-gray-100">
            {rows.map((row, i) => {
              const isWinner = row.winner_nickname === result.winner_nickname;
              return (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span className="font-medium text-gray-900">
                    {row.value_name}
                  </span>
                  <span
                    className={[
                      "text-right",
                      isWinner ? "text-brand-700 font-semibold" : "text-gray-600",
                    ].join(" ")}
                  >
                    {row.winner_nickname} · ₩{row.amount.toLocaleString("ko-KR")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Emoji reactions */}
      <section className="relative mt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          오늘 활동 어땠나요?
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {REACTIONS.map((r) => {
            const isMine = myReaction === r.key;
            const count = reactionCounts[r.key];
            const disabled = !myParticipantId;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => toggleReaction(r.key)}
                disabled={disabled}
                className={[
                  "rounded-2xl border py-3 flex flex-col items-center gap-0.5 transition",
                  isMine
                    ? "bg-brand-500 border-brand-500 text-white shadow ring-2 ring-brand-300"
                    : "bg-white border-gray-200 hover:border-brand-300 hover:bg-brand-50",
                  disabled ? "opacity-90 cursor-default" : "",
                ].join(" ")}
              >
                <span className="text-3xl leading-none">{r.emoji}</span>
                <span
                  className={[
                    "text-xl font-extrabold tabular-nums leading-tight",
                    isMine ? "text-white" : "text-gray-900",
                  ].join(" ")}
                >
                  {count}
                </span>
                <span
                  className={[
                    "text-[10px]",
                    isMine ? "text-white/90" : "text-gray-400",
                  ].join(" ")}
                >
                  {r.label}
                </span>
              </button>
            );
          })}
        </div>
        {reactionError && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
            {reactionError}
          </p>
        )}
        {!myParticipantId && (
          <p className="mt-2 text-xs text-gray-400 text-center">
            리더는 반응 카운트만 확인할 수 있어요
          </p>
        )}
      </section>

      {/* Encouragement messages — members only. The leader reads arriving
          messages inside the 팀 피드백 레포트 card rendered by the page. */}
      {!isLeader && (
        <section className="relative mt-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            💌 리더에게 한마디
          </h2>

          {myParticipantId ? (
            <div className="space-y-2">
              {sentMessage ? (
                <>
                  <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 p-4 text-center">
                    <p className="text-base font-bold text-emerald-700">
                      💌 전달됐어요!
                    </p>
                    <p className="mt-1.5 text-sm text-emerald-800 italic">
                      “{sentMessage}”
                    </p>
                    <p className="mt-2 text-[11px] text-emerald-600">
                      리더님께 전달되었어요
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={resendMessage}
                    className="w-full rounded-2xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-700 font-semibold py-3 text-sm"
                  >
                    ✏️ 다시 보내기
                  </button>
                </>
              ) : (
                <>
                  <textarea
                    value={messageDraft}
                    onChange={(e) => setMessageDraft(e.target.value)}
                    placeholder="리더에게 격려의 한 마디 부탁드립니다 :)"
                    rows={3}
                    maxLength={200}
                    className="w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
                  />
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sendAnonymously}
                      onChange={(e) => setSendAnonymously(e.target.checked)}
                      className="w-4 h-4 accent-brand-500"
                    />
                    <span className="text-xs text-gray-600">익명으로 보내기</span>
                  </label>
                  <p className="text-[11px] text-gray-400">
                    200자 이내 · 여러 번 보낼 수 있어요
                  </p>
                  {messageError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
                      {messageError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={sending || !messageDraft.trim()}
                    className="w-full rounded-2xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold py-3 text-sm shadow-sm"
                  >
                    {sending ? "전달 중…" : "보내기"}
                  </button>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">
              팀원으로 입장하면 메시지를 보낼 수 있어요
            </p>
          )}
        </section>
      )}

      {/* Sharing time */}
      <section className="relative mt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          🎤 나눔 시간
        </h2>

        {ladder ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-5 text-center">
            <p className="text-base font-semibold text-gray-800">
              🎤 {nameById.get(ladder.winner_id) ?? "?"}님의 나눔을 기대해주세요!
            </p>
          </div>
        ) : sharingOrder.length === 0 ? (
          <FirstSpeakerPicker
            isLeader={isLeader}
            participants={nonLeaderParticipants}
            onStartLadder={startLadder}
            onPickDirect={pickFirstSpeaker}
          />
        ) : sharingDone ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-5 text-center space-y-3">
            <p className="text-base text-gray-800 font-semibold leading-relaxed">
              🎉 나눔이 모두 끝났어요!
              <br />
              오늘 가치관 경매, 모두 수고하셨어요 😊
            </p>
            {isLeader && (
              <button
                type="button"
                onClick={resetSharing}
                className="w-full rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 text-sm"
              >
                🔄 나눔 다시 시작
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div
              className={[
                "rounded-2xl text-white p-5 text-center shadow-sm",
                isMyTurn
                  ? "bg-gradient-to-br from-emerald-500 to-emerald-600"
                  : "bg-gradient-to-br from-brand-500 to-brand-600",
              ].join(" ")}
            >
              {isMyTurn ? (
                <>
                  <p className="text-sm opacity-90 mb-1">
                    {sharing.method === "random"
                      ? "🎰 돌림판으로 선정됐어요!"
                      : "🎤 리더님이 지목했어요!"}
                  </p>
                  <p className="text-2xl font-extrabold">내 차례예요!</p>
                  <p className="mt-2 text-xs opacity-90">
                    준비되면 팀에게 나눔을 시작해주세요
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs opacity-90 mb-1">
                    {sharing.method === "random"
                      ? `🎰 ${currentSpeaker?.nickname ?? "알 수 없음"}님이 돌림판으로 선정됐어요!`
                      : `🎤 ${currentSpeaker?.nickname ?? "알 수 없음"}님이 지목됐어요!`}
                  </p>
                  <p className="text-2xl font-extrabold">
                    {currentSpeaker?.nickname ?? "알 수 없음"}님 차례예요!
                  </p>
                </>
              )}
            </div>

            {currentSpeaker && <SharingGuide />}

            {sharingOrder.length > 1 && (
              <div className="rounded-2xl bg-white border border-gray-200 p-3">
                <p className="text-[11px] font-semibold text-gray-500 mb-1.5">
                  ✓ 나눔 완료
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {sharingOrder.slice(0, -1).map((pid, i) => (
                    <span
                      key={pid + i}
                      className="text-xs rounded-full px-2.5 py-1 bg-gray-100 text-gray-500 line-through"
                    >
                      {nameById.get(pid) ?? "?"}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Leader can always pick next; the current speaker (member) can
                also pick the next person once they're done sharing. */}
            {remainingSpeakers.length > 0 && (isLeader || isMyTurn) && (
              <NextSpeakerPicker
                remaining={remainingSpeakers}
                onPick={pickNextSpeaker}
                hint={
                  isMyTurn
                    ? "나눔이 끝났다면 다음 사람을 지목해주세요"
                    : undefined
                }
              />
            )}
          </div>
        )}
      </section>

      {pickedPopup && (
        <PickedPopup
          pickerName={pickedPopup.pickerName}
          myNickname={myNickname ?? "회원"}
          onClose={() => {
            setPickedPopup(null);
            requestAnimationFrame(() => {
              document.getElementById("sharing-guide")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            });
          }}
        />
      )}

      {ladder && (
        <LadderModal
          ladder={ladder}
          nameById={nameById}
          isLeader={isLeader}
          myParticipantId={myParticipantId}
          onConfirm={commitLadderWinner}
          onRerun={startLadder}
        />
      )}
    </div>
  );
}

function FirstSpeakerPicker({
  isLeader,
  participants,
  onStartLadder,
  onPickDirect,
}: {
  isLeader: boolean;
  participants: Participant[];
  onStartLadder: () => void;
  onPickDirect: (id: string) => void;
}) {
  const [mode, setMode] = useState<"none" | "direct">("none");
  const [selected, setSelected] = useState<string>("");

  if (participants.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-5 text-center">
        <p className="text-sm text-gray-500">나눔할 팀원이 없어요</p>
      </div>
    );
  }

  if (!isLeader) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-5 text-center">
        <p className="text-sm text-gray-500">
          리더가 첫 나눔자를 뽑고 있어요…
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-5">
      <p className="text-sm text-gray-700 font-medium mb-3 text-center">
        첫 번째 나눔자를 어떻게 정할까요?
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onStartLadder}
          className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-bold py-4 text-sm shadow-sm"
        >
          🎰 돌리기
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "direct" ? "none" : "direct")}
          className={[
            "rounded-2xl font-bold py-4 text-sm shadow-sm border-2",
            mode === "direct"
              ? "bg-brand-50 border-brand-400 text-brand-700"
              : "bg-white border-gray-200 text-gray-700 hover:border-brand-300",
          ].join(" ")}
        >
          ✋ 직접 지목하기
        </button>
      </div>

      {mode === "direct" && (
        <div className="mt-3 flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2.5 text-sm bg-white"
          >
            <option value="">팀원 선택…</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              if (!selected) return;
              onPickDirect(selected);
              setSelected("");
              setMode("none");
            }}
            disabled={!selected}
            className="shrink-0 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold px-4 py-2.5 text-sm"
          >
            지목
          </button>
        </div>
      )}

      <p className="mt-3 text-[11px] text-gray-400 text-center">
        팀원 {participants.length}명 중 1명이 첫 나눔자로 뽑혀요
      </p>
    </div>
  );
}

function NextSpeakerPicker({
  remaining,
  onPick,
  hint,
}: {
  remaining: Participant[];
  onPick: (id: string) => void;
  hint?: string;
}) {
  const [selected, setSelected] = useState<string>("");
  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-4">
      <p className="text-sm font-semibold text-gray-700 mb-2">
        ➡️ 다음 사람 지목하기
      </p>
      {hint && (
        <p className="text-[11px] text-gray-500 mb-2">{hint}</p>
      )}
      <div className="flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2.5 text-sm bg-white"
        >
          <option value="">팀원 선택…</option>
          {remaining.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nickname}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            if (!selected) return;
            onPick(selected);
            setSelected("");
          }}
          disabled={!selected}
          className="shrink-0 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold px-4 py-2.5 text-sm"
        >
          지목
        </button>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        남은 팀원 {remaining.length}명
      </p>
    </div>
  );
}

function PickedPopup({
  pickerName,
  myNickname,
  onClose,
}: {
  pickerName: string;
  myNickname: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl animate-pop-in">
        <p className="text-4xl mb-3">🎤</p>
        <p className="text-lg font-extrabold text-brand-600">
          {pickerName}님이 {myNickname}님을 지목했어요!
        </p>
        <p className="mt-3 text-sm text-gray-500">
          준비되면 팀에게 나눔을 시작해주세요
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-bold py-3.5 text-base shadow"
        >
          나눔 시작
        </button>
      </div>
    </div>
  );
}
