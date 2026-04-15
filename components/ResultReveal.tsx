"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import LadderGame from "./LadderGame";
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
import {
  useEncouragements,
  type Encouragement,
} from "@/lib/useEncouragements";
import { useReactions } from "@/lib/useReactions";
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
  content,
  result,
  sessionId,
  participants,
  auctionState,
  myParticipantId,
  isLeader,
}: Props) {
  const reactions = useReactions(sessionId);
  const encouragements = useEncouragements(sessionId);
  const sharing = useSharingState(sessionId);

  const rows = result.result_data?.rows ?? [];
  const stats = useMemo(() => computeWinner(rows).stats, [rows]);

  // Optimistic override: undefined means "use server state"; null means
  // "toggled off"; a ReactionKey means the user just tapped that emoji. Cleared
  // as soon as realtime catches up.
  const [pendingEmoji, setPendingEmoji] = useState<
    ReactionKey | null | undefined
  >(undefined);
  const [reactionError, setReactionError] = useState<string | null>(null);

  const serverMyReaction = useMemo<ReactionKey | null>(() => {
    if (!myParticipantId) return null;
    const mine = reactions
      .filter((r) => r.participant_id === myParticipantId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return mine[0]?.emoji ?? null;
  }, [reactions, myParticipantId]);

  const myReaction =
    pendingEmoji !== undefined ? pendingEmoji : serverMyReaction;

  useEffect(() => {
    if (pendingEmoji !== undefined && serverMyReaction === pendingEmoji) {
      setPendingEmoji(undefined);
    }
  }, [serverMyReaction, pendingEmoji]);

  const reactionCounts = useMemo(() => {
    const out: Record<ReactionKey, number> = {
      thumbs_up: 0,
      laugh: 0,
      fire: 0,
      sad: 0,
    };
    for (const r of reactions) {
      if (myParticipantId && r.participant_id === myParticipantId) continue;
      out[r.emoji]++;
    }
    if (myReaction) out[myReaction]++;
    return out;
  }, [reactions, myParticipantId, myReaction]);

  async function toggleReaction(emoji: ReactionKey) {
    if (!myParticipantId) return;
    const nextOptimistic: ReactionKey | null =
      myReaction === emoji ? null : emoji;
    setPendingEmoji(nextOptimistic);
    setReactionError(null);

    const supabase = getSupabaseClient();
    try {
      const { error: delError } = await supabase
        .from("reactions")
        .delete()
        .eq("session_id", sessionId)
        .eq("participant_id", myParticipantId);
      if (delError) throw delError;

      if (nextOptimistic) {
        const { error } = await supabase.from("reactions").insert({
          session_id: sessionId,
          participant_id: myParticipantId,
          emoji: nextOptimistic,
        });
        if (error) throw error;
      }
    } catch (e) {
      console.error("[reactions] toggle failed", e);
      setPendingEmoji(undefined);
      setReactionError(
        "반응을 저장하지 못했어요. 네트워크를 확인하고 다시 시도해주세요.",
      );
    }
  }

  // Encouragement messages — 1 per participant, freeform text.
  const [messageDraft, setMessageDraft] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | undefined>(
    undefined,
  );
  const [messageError, setMessageError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const serverMyMessage = useMemo<string | null>(() => {
    if (!myParticipantId) return null;
    const mine = encouragements
      .filter((e) => e.participant_id === myParticipantId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return mine[0]?.message ?? null;
  }, [encouragements, myParticipantId]);

  const myMessage =
    pendingMessage !== undefined ? pendingMessage : serverMyMessage;

  useEffect(() => {
    if (pendingMessage !== undefined && serverMyMessage === pendingMessage) {
      setPendingMessage(undefined);
    }
  }, [serverMyMessage, pendingMessage]);

  // Newest-first list for the leader's view (anonymous — nickname is never
  // rendered on the leader screen).
  const messagesNewestFirst = useMemo(
    () =>
      [...encouragements].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    [encouragements],
  );

  async function sendMessage() {
    if (!myParticipantId) return;
    const trimmed = messageDraft.trim();
    if (!trimmed) return;
    setSending(true);
    setMessageError(null);
    setPendingMessage(trimmed);

    const supabase = getSupabaseClient();
    try {
      const { error: delError } = await supabase
        .from("encouragements")
        .delete()
        .eq("session_id", sessionId)
        .eq("participant_id", myParticipantId);
      if (delError) throw delError;

      const { error } = await supabase.from("encouragements").insert({
        session_id: sessionId,
        participant_id: myParticipantId,
        message: trimmed,
      });
      if (error) throw error;
      setMessageDraft("");
    } catch (e) {
      console.error("[encouragements] send failed", e);
      setPendingMessage(undefined);
      setMessageError(
        "메시지를 전달하지 못했어요. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      setSending(false);
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

    // The person who picked me is the previous entry in the sharing order,
    // or the leader if I'm the first speaker.
    const idx = sharing.index;
    const pickerId = idx > 0 ? sharingOrder[idx - 1] : null;
    const pickerName = pickerId ? nameById.get(pickerId) ?? "리더" : "리더";

    setPickedPopup({ pickerName });
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch {
        // Silent — vibrate is best-effort.
      }
    }
  }, [currentSpeakerId, myParticipantId, sharing.index, sharingOrder, nameById]);

  async function startLadder() {
    if (nonLeaderParticipants.length === 0) return;
    const cols = nonLeaderParticipants.length;
    const rows = Math.max(5, Math.min(8, cols + 2));
    const shuffled = [...nonLeaderParticipants]
      .sort(() => Math.random() - 0.5)
      .map((p) => p.id);

    const rungs: { row: number; col: number }[] = [];
    for (let r = 0; r < rows; r++) {
      let skip = -2;
      for (let c = 0; c < cols - 1; c++) {
        if (c === skip + 1) continue;
        if (Math.random() < 0.55) {
          rungs.push({ row: r, col: c });
          skip = c;
        }
      }
    }

    const start_col = Math.floor(Math.random() * cols);
    let col = start_col;
    for (let r = 0; r < rows; r++) {
      if (rungs.some((x) => x.col === col && x.row === r)) col = col + 1;
      else if (rungs.some((x) => x.col === col - 1 && x.row === r))
        col = col - 1;
    }
    const winner_id = shuffled[col];

    const ladderData: SharingLadder = {
      candidates: shuffled,
      rungs,
      rows,
      start_col,
      winner_id,
      started_at: new Date().toISOString(),
      duration_ms: 4000,
    };
    const supabase = getSupabaseClient();
    await supabase
      .from("sessions")
      .update({ sharing_ladder: ladderData })
      .eq("id", sessionId);
  }

  // Leader is authoritative for committing the ladder winner into sharing_order
  // once the animation time elapses.
  const ladderCommittedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isLeader) return;
    if (!ladder) return;
    if (ladderCommittedRef.current === ladder.started_at) return;
    const elapsed = Date.now() - new Date(ladder.started_at).getTime();
    const remaining = Math.max(0, ladder.duration_ms - elapsed) + 400;
    const t = setTimeout(async () => {
      ladderCommittedRef.current = ladder.started_at;
      const supabase = getSupabaseClient();
      await supabase
        .from("sessions")
        .update({
          sharing_order: [ladder.winner_id],
          sharing_index: 0,
          sharing_ladder: null,
        })
        .eq("id", sessionId);
    }, remaining);
    return () => clearTimeout(t);
  }, [ladder, isLeader, sessionId]);

  async function pickFirstSpeaker(participantId: string) {
    const supabase = getSupabaseClient();
    await supabase
      .from("sessions")
      .update({
        sharing_order: [participantId],
        sharing_index: 0,
        sharing_ladder: null,
      })
      .eq("id", sessionId);
  }

  async function pickNextSpeaker(participantId: string) {
    const nextOrder = [...sharingOrder, participantId];
    const supabase = getSupabaseClient();
    await supabase
      .from("sessions")
      .update({
        sharing_order: nextOrder,
        sharing_index: nextOrder.length - 1,
      })
      .eq("id", sessionId);
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

      {/* Encouragement messages */}
      <section className="relative mt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          💌 리더에게 한마디
        </h2>

        {isLeader ? (
          <div className="space-y-2">
            {messagesNewestFirst.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-6 text-center">
                팀원이 메시지를 보내면 실시간으로 도착해요
              </p>
            ) : (
              <ul className="space-y-2">
                {messagesNewestFirst.map((m, i) => (
                  <EncouragementCard key={m.id} message={m} isLatest={i === 0} />
                ))}
              </ul>
            )}
          </div>
        ) : myParticipantId ? (
          myMessage ? (
            <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 p-5 text-center">
              <p className="text-base font-bold text-emerald-700">
                💌 전달됐어요!
              </p>
              <p className="mt-2 text-sm text-emerald-800 italic">
                “{myMessage}”
              </p>
              <p className="mt-3 text-[11px] text-emerald-600">
                리더님께 익명으로 전달되었어요
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                placeholder="리더에게 격려의 한 마디 부탁드립니다 :)"
                rows={3}
                maxLength={200}
                className="w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
              />
              <p className="text-[11px] text-gray-400">
                익명으로 전달돼요 · 200자 이내 · 한 번만 보낼 수 있어요
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
            </div>
          )
        ) : (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">
            팀원으로 입장하면 메시지를 보낼 수 있어요
          </p>
        )}
      </section>

      {/* Sharing time */}
      <section className="relative mt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          🎤 나눔 시간
        </h2>

        {ladder ? (
          <LadderGame ladder={ladder} nameById={nameById} />
        ) : sharingOrder.length === 0 ? (
          <FirstSpeakerPicker
            isLeader={isLeader}
            participants={nonLeaderParticipants}
            onStartLadder={startLadder}
            onPickDirect={pickFirstSpeaker}
          />
        ) : sharingDone ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-5 text-center">
            <p className="text-sm text-gray-700 font-medium">
              나눔이 모두 끝났어요 🙂
            </p>
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
                  <p className="text-sm opacity-90 mb-1">🎤 지금은</p>
                  <p className="text-2xl font-extrabold">
                    내 차례예요!
                  </p>
                  <p className="mt-2 text-xs opacity-90">
                    준비되면 팀에게 나눔을 시작해주세요
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs opacity-90 mb-1">🎤 지금은</p>
                  <p className="text-2xl font-extrabold">
                    {currentSpeaker?.nickname ?? "알 수 없음"}님 차례예요!
                  </p>
                </>
              )}
            </div>

            {currentSpeaker && (
              <SharingGuide
                speaker={currentSpeaker}
                auctionState={auctionState}
              />
            )}

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

      <p className="relative mt-10 text-center text-xs text-gray-400">
        {content.title} · 모두 수고하셨어요 🙂
      </p>

      {pickedPopup && (
        <PickedPopup
          pickerName={pickedPopup.pickerName}
          onClose={() => setPickedPopup(null)}
        />
      )}
    </div>
  );
}

function EncouragementCard({
  message,
  isLatest,
}: {
  message: Encouragement;
  isLatest: boolean;
}) {
  return (
    <li
      className={[
        "rounded-2xl p-4 shadow-sm",
        isLatest
          ? "bg-gradient-to-br from-brand-500 to-brand-600 text-white"
          : "bg-white border border-gray-200 text-gray-800",
      ].join(" ")}
    >
      {isLatest && (
        <p className="text-[11px] opacity-90 mb-1">✨ 방금 전 · 익명</p>
      )}
      {!isLatest && (
        <p className="text-[11px] text-gray-400 mb-1">익명</p>
      )}
      <p
        className={[
          "text-base font-semibold whitespace-pre-wrap break-words",
          isLatest ? "" : "text-gray-800",
        ].join(" ")}
      >
        {message.message}
      </p>
    </li>
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
          🎲 랜덤으로 뽑기
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
  onClose,
}: {
  pickerName: string;
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
        <p className="text-lg font-extrabold text-gray-900">
          {pickerName}님이
        </p>
        <p className="text-lg font-extrabold text-brand-600">
          회원님을 지목했어요!
        </p>
        <p className="mt-3 text-sm text-gray-500">
          준비되면 팀에게 나눔을 시작해주세요
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-bold py-3.5 text-base shadow"
        >
          확인
        </button>
      </div>
    </div>
  );
}
