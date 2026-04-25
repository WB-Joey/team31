"use client";

// 성경퀴즈대회 — member view shell (stage 3-3).
//
// First version: just shows the room/game header, the participant's nickname,
// the leader-configured fruit count, and a "waiting for the next question"
// state. Real gameplay (answer input, scoreboard mode, reveal animations,
// fruit decrements) is wired in later stages.
//
// Visual language matches QuizGameView so leader and member feel like one
// product: same gradient room-code header, same brand pill list, same
// rounded-2xl card grammar.

import Link from "next/link";

import { useParticipants } from "@/lib/useParticipants";
import { useQuizState } from "@/lib/useQuizState";

interface Props {
  sessionId: string;
  roomCode: string;
  myNickname: string;
  myParticipantId: string | null;
}

export default function QuizMemberView({
  sessionId,
  roomCode,
  myNickname,
  myParticipantId,
}: Props) {
  const participants = useParticipants(sessionId);
  const { state, loaded } = useQuizState(sessionId);

  // Look up our per-participant runtime entry. Until the first question
  // round is run (stage 3-5+) this will usually be undefined, so fall back
  // to the leader-configured starting fruit count for the display.
  const myEntry = myParticipantId ? state.participants?.[myParticipantId] : undefined;
  const fruitsLeft = myEntry?.fruits_remaining ?? state.starting_fruits ?? 3;
  const isEliminated = !!myEntry?.is_eliminated;

  return (
    <main className="min-h-screen px-5 pt-6 pb-12 max-w-xl mx-auto overflow-x-hidden">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
        >
          ← 홈
        </Link>
        {myNickname && (
          <span className="text-xl font-extrabold text-gray-900">
            {myNickname}님
          </span>
        )}
      </div>

      {/* Game header — matches the leader's room-code hero language */}
      <section className="mt-4 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white p-5">
        <p className="text-xs opacity-80">오늘의 콘텐츠</p>
        <h1 className="text-2xl font-bold mt-1">성경퀴즈대회</h1>
        <p className="text-xs opacity-80 mt-3">룸코드</p>
        <p className="text-2xl font-bold tracking-[0.25em] tabular-nums">
          {roomCode}
        </p>
      </section>

      {/* My fruit count — large hero card so the player can read it across
          a room while holding the phone up. */}
      <section
        className={[
          "mt-5 rounded-2xl border p-6 text-center",
          isEliminated
            ? "bg-gray-50 border-gray-200 text-gray-400"
            : "bg-white border-gray-200 text-gray-900",
        ].join(" ")}
      >
        <p className="text-xs font-semibold tracking-wider uppercase opacity-70">
          {isEliminated ? "탈락" : "내 생명나무 열매"}
        </p>
        <p
          aria-hidden
          className="mt-3 text-4xl leading-none select-none"
          title={`${fruitsLeft}개`}
        >
          {fruitsLeft > 0 ? "🍎".repeat(fruitsLeft) : "💀"}
        </p>
        <p className="mt-3 text-3xl font-bold tabular-nums">{fruitsLeft}개</p>
        {!isEliminated && (
          <p className="mt-2 text-xs text-gray-500 leading-relaxed">
            틀리면 1개씩 사라져요.
            <br />
            0이 되면 탈락이에요.
          </p>
        )}
        {isEliminated && (
          <p className="mt-2 text-xs leading-relaxed">
            넌센스 문제를 맞히면 부활할 수 있어요!
          </p>
        )}
      </section>

      {/* Waiting card */}
      <section className="mt-3 rounded-2xl bg-brand-50 border border-brand-100 p-6 text-center text-brand-900">
        <div className="text-3xl mb-2">⏳</div>
        <p className="font-semibold">
          {loaded ? "MC가 문제를 출제하기를 기다리고 있어요" : "준비 중…"}
        </p>
        <p className="mt-1 text-xs text-brand-800/80">
          문제가 나오면 답을 입력하고 폰을 들어주세요 📱
        </p>
      </section>

      {/* Other participants — visually identical to the auction page,
          but each member's fruit count is shown next to their name. */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          함께하는 사람들 ({participants.length}명)
        </h2>
        {participants.length === 0 ? (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">
            아직 다른 팀원이 없어요
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {participants.map((p) => {
              const isMe = p.nickname === myNickname;
              const entry = state.participants?.[p.id];
              const fruits = entry?.fruits_remaining;
              const eliminated = !!entry?.is_eliminated;
              return (
                <li
                  key={p.id}
                  className={[
                    "rounded-full text-sm px-3 py-1.5 border inline-flex items-center gap-1.5",
                    eliminated
                      ? "bg-gray-100 text-gray-400 border-gray-200 line-through"
                      : isMe
                      ? "bg-brand-500 text-white border-brand-500"
                      : "bg-brand-50 text-brand-700 border-brand-100",
                  ].join(" ")}
                >
                  <span>
                    {p.nickname}
                    {p.is_leader && " 👑"}
                    {isMe && " (나)"}
                  </span>
                  {!eliminated && fruits !== undefined && (
                    <span className="text-[10px] opacity-80 tabular-nums">
                      🍎{fruits}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
