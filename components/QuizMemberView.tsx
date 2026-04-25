"use client";

// 성경퀴즈대회 — member view (stage 3-5c).
//
// Adds question display + live countdown on top of the 3-3 shell.
// Phases the member sees:
//   - phase === 'idle' → game hasn't started; show "준비 중"
//   - phase === 'thinking' && current_question → show the question, choices,
//     answer input box, and live countdown
//   - phase === 'thinking' but no question yet → show "MC 출제 대기"
//
// Answer submission and reveal animations land in 3-5d/3-5e. The answer
// input below is intentionally non-functional for now so the layout is in
// place when we wire it up.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useParticipants } from "@/lib/useParticipants";
import { useQuizState } from "@/lib/useQuizState";

interface Props {
  sessionId: string;
  roomCode: string;
  myNickname: string;
  myParticipantId: string | null;
}

const QUESTION_TYPE_LABELS = {
  subjective: "주관식",
  multiple_choice: "객관식",
  ox: "O / X",
  nonsense: "넌센스 🎁",
} as const;

export default function QuizMemberView({
  sessionId,
  roomCode,
  myNickname,
  myParticipantId,
}: Props) {
  const participants = useParticipants(sessionId);
  const { state, loaded } = useQuizState(sessionId);

  const [draftAnswer, setDraftAnswer] = useState("");

  // 1Hz tick for the countdown.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state.phase !== "thinking") return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [state.phase]);

  // Reset the draft answer when a new question lands so we don't carry old
  // text into the next round.
  const currentQuestionId = state.current_question?.id ?? null;
  useEffect(() => {
    setDraftAnswer("");
  }, [currentQuestionId]);

  const myEntry = myParticipantId
    ? state.participants?.[myParticipantId]
    : undefined;
  const fruitsLeft = myEntry?.fruits_remaining ?? state.starting_fruits ?? 3;
  const isEliminated = !!myEntry?.is_eliminated;

  const remainingSeconds = useMemo(() => {
    if (state.phase !== "thinking") return 0;
    const startedAt = state.thinking_started_at;
    const duration = state.thinking_duration_seconds ?? 30;
    if (!startedAt) return duration;
    const elapsed = Math.floor(
      (Date.now() - new Date(startedAt).getTime()) / 1000,
    );
    return Math.max(0, duration - elapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.thinking_started_at, state.thinking_duration_seconds]);

  const phase = state.phase ?? "idle";
  const inSetup = phase === "idle";
  const currentQ = state.current_question;
  const questionOnFloor = !inSetup && !!currentQ;

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

      <section className="mt-4 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white p-5">
        <p className="text-xs opacity-80">오늘의 콘텐츠</p>
        <h1 className="text-2xl font-bold mt-1">성경퀴즈대회</h1>
        <p className="text-xs opacity-80 mt-3">룸코드</p>
        <p className="text-2xl font-bold tracking-[0.25em] tabular-nums">
          {roomCode}
        </p>
      </section>

      {/* My fruit count */}
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

      {/* Question display */}
      {questionOnFloor ? (
        <section className="mt-5 rounded-2xl bg-white border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 tracking-wider uppercase">
              Round {state.question_number ?? 1} ·{" "}
              {QUESTION_TYPE_LABELS[currentQ.type]}
            </p>
            <p
              className={[
                "text-2xl font-bold tabular-nums",
                remainingSeconds <= 10
                  ? "text-orange-600"
                  : "text-gray-900",
              ].join(" ")}
            >
              {remainingSeconds}s
            </p>
          </div>

          <p className="text-lg font-semibold text-gray-900 leading-relaxed">
            {currentQ.text}
          </p>

          {currentQ.type === "multiple_choice" && currentQ.choices && (
            <ul className="mt-4 space-y-2">
              {currentQ.choices.map((c, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm flex items-start gap-2"
                >
                  <span className="font-bold text-brand-600">{i + 1}.</span>
                  <span className="text-gray-800">{c}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Answer input — UI only for now. Stage 3-5d wires this to the DB
              and adds the scoreboard ("전광판") full-screen mode. */}
          <div className="mt-5">
            <label className="text-xs font-semibold text-gray-700 mb-1 block">
              답 입력
            </label>
            {currentQ.type === "ox" ? (
              <div className="grid grid-cols-2 gap-2">
                {(["O", "X"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDraftAnswer(v)}
                    disabled={isEliminated}
                    className={[
                      "rounded-xl py-4 text-3xl font-bold border transition",
                      draftAnswer === v
                        ? "bg-brand-500 text-white border-brand-500"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50",
                      isEliminated && "opacity-40 cursor-not-allowed",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {v}
                  </button>
                ))}
              </div>
            ) : currentQ.type === "multiple_choice" ? (
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDraftAnswer(String(n))}
                    disabled={isEliminated}
                    className={[
                      "rounded-xl py-4 text-2xl font-bold border transition",
                      draftAnswer === String(n)
                        ? "bg-brand-500 text-white border-brand-500"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50",
                      isEliminated && "opacity-40 cursor-not-allowed",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {n}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="text"
                value={draftAnswer}
                onChange={(e) => setDraftAnswer(e.target.value)}
                disabled={isEliminated}
                placeholder="답을 입력하세요"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-brand-300 focus:ring-2 focus:ring-brand-100 outline-none p-4 text-base transition disabled:opacity-40"
              />
            )}

            <button
              type="button"
              disabled={!draftAnswer.trim() || isEliminated}
              onClick={() =>
                alert("답 제출 + 전광판 모드는 다음 단계에서 추가돼요 🔜")
              }
              className="mt-3 w-full rounded-2xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3.5 text-base shadow-sm transition"
            >
              ✓ 확인
            </button>
            <p className="mt-2 text-[11px] text-gray-400 text-center">
              확인 누르면 답이 화면에 크게 떠요. MC가 정답을 부르면 폰을
              들어주세요 📱
            </p>
          </div>
        </section>
      ) : (
        <section className="mt-3 rounded-2xl bg-brand-50 border border-brand-100 p-6 text-center text-brand-900">
          <div className="text-3xl mb-2">⏳</div>
          <p className="font-semibold">
            {!loaded
              ? "준비 중…"
              : inSetup
              ? "MC가 게임을 시작하기를 기다리고 있어요"
              : "MC가 첫 문제를 출제하기를 기다리고 있어요"}
          </p>
          <p className="mt-1 text-xs text-brand-800/80">
            문제가 나오면 답을 입력하고 폰을 들어주세요 📱
          </p>
        </section>
      )}

      {/* Other participants */}
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
