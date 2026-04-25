"use client";

// 성경퀴즈대회 — leader view (stage 3-5a).
//
// Phase routing:
//   - 'idle'                    → setup panel (fruit count + reference text)
//   - 'thinking' / 'answers_locked' / 'revealed' → game-in-progress shell
//
// Stage 3-5a additions on top of 3-2:
//   1. "게임 시작하기" actually transitions phase idle → thinking and seeds
//      every currently-joined participant with the leader-configured fruit
//      count.
//   2. Late-joining members are auto-enrolled: whenever the participants
//      list grows after the game has started, anyone missing from
//      quiz_state.participants is added with full fruits. (Option B / open.)
//
// The actual question UI (drawing, answer reveal, fruit decrement, confetti)
// is still TBD — stages 3-5b through 3-5e — and lives behind the in-progress
// placeholder card for now.

import Link from "next/link";
import { useEffect, useState } from "react";

import { useParticipants } from "@/lib/useParticipants";
import { useQuizState } from "@/lib/useQuizState";
import type { QuizParticipantState } from "@/lib/types";

interface Props {
  sessionId: string;
  roomCode: string;
}

const MIN_FRUITS = 2;
const MAX_FRUITS = 5;
const REFERENCE_MAX_CHARS = 4000;

// Build the per-participant entry that goes into quiz_state.participants.
function newParticipantEntry(startingFruits: number): QuizParticipantState {
  return {
    fruits_remaining: startingFruits,
    is_eliminated: false,
    total_correct: 0,
    current_answer: null,
    answer_submitted_at: null,
  };
}

export default function QuizGameView({ sessionId, roomCode }: Props) {
  const participants = useParticipants(sessionId);
  const { state, loaded, wasEmpty, patch } = useQuizState(sessionId);

  const [copied, setCopied] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [referenceDraft, setReferenceDraft] = useState("");
  const [referenceDirty, setReferenceDirty] = useState(false);
  const [referenceSaving, setReferenceSaving] = useState(false);
  const [referenceJustSaved, setReferenceJustSaved] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    if (!referenceDirty) {
      setReferenceDraft(state.reference_text ?? "");
    }
  }, [loaded, state.reference_text, referenceDirty]);

  // Persist the defaults exactly once when a brand-new session is loaded.
  useEffect(() => {
    if (!loaded || !wasEmpty) return;
    void patch({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Late-join enrollment: when participants list changes after the game has
  // started, auto-add any newcomers with full fruit count.
  useEffect(() => {
    if (!loaded) return;
    if (state.phase === "idle") return;
    const startingFruits = state.starting_fruits ?? 3;
    const existing = state.participants ?? {};
    const missing = participants.filter((p) => !existing[p.id]);
    if (missing.length === 0) return;
    const additions: Record<string, QuizParticipantState> = {};
    for (const p of missing) {
      additions[p.id] = newParticipantEntry(startingFruits);
    }
    void patch({
      participants: { ...existing, ...additions },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, state.phase, loaded]);

  async function copyCode() {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const message = [
      "🔔 오늘은 성경퀴즈대회가 열려요!",
      "아래 링크로 입장해주세요 😊",
      "",
      `👉 ${appUrl}`,
      "",
      "PW:",
      roomCode,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be unavailable.
    }
  }

  function bumpFruits(delta: number) {
    const current = state.starting_fruits ?? 3;
    const next = Math.max(MIN_FRUITS, Math.min(MAX_FRUITS, current + delta));
    if (next === current) return;
    void patch({ starting_fruits: next });
  }

  async function saveReference() {
    if (!referenceDirty) return;
    setReferenceSaving(true);
    await patch({ reference_text: referenceDraft });
    setReferenceSaving(false);
    setReferenceDirty(false);
    setReferenceJustSaved(true);
    setTimeout(() => setReferenceJustSaved(false), 1500);
  }

  // Start the game: seed every currently-joined participant with the
  // configured fruit count, then move to 'thinking' so 3-5b can take over
  // with the question UI.
  async function startGame() {
    if (participants.length === 0) return;
    const startingFruits = state.starting_fruits ?? 3;
    const seeded: Record<string, QuizParticipantState> = {};
    for (const p of participants) {
      // Preserve any existing entry just in case (shouldn't happen on first
      // start, but defensive).
      seeded[p.id] =
        state.participants?.[p.id] ?? newParticipantEntry(startingFruits);
    }
    await patch({
      phase: "thinking",
      participants: seeded,
      question_number: 0, // 3-5b will increment when the first question is drawn.
    });
  }

  const fruits = state.starting_fruits ?? 3;
  const refLen = referenceDraft.length;
  const hasReference = (state.reference_text ?? "").trim().length > 0;
  const phase = state.phase ?? "idle";
  const inSetup = phase === "idle";

  return (
    <main className="min-h-screen px-5 pt-6 pb-28 max-w-xl mx-auto overflow-x-hidden">
      <Link
        href="/"
        className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
      >
        ← 홈
      </Link>

      {/* Room code hero */}
      <section className="mt-3 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white p-5 shadow-sm">
        <p className="text-xs opacity-80">성경퀴즈대회</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs opacity-80 mb-1">룸코드</p>
            <p className="text-4xl font-bold tracking-[0.25em] tabular-nums">
              {roomCode}
            </p>
          </div>
          <button
            type="button"
            onClick={copyCode}
            className="shrink-0 rounded-xl bg-white/20 hover:bg-white/30 active:bg-white/40 px-4 py-2 text-sm font-medium transition"
          >
            {copied ? "복사됨 ✓" : "초대 메시지 복사"}
          </button>
        </div>
      </section>

      {/* Participants list with per-member fruit count once game is running */}
      <section className="mt-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          참여 팀원 ({participants.length}명)
        </h2>
        {participants.length === 0 ? (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">
            팀원이 입장하면 여기 표시돼요
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {participants.map((p) => {
              const entry = state.participants?.[p.id];
              const eliminated = !!entry?.is_eliminated;
              const fruitCount = entry?.fruits_remaining;
              return (
                <li
                  key={p.id}
                  className={[
                    "rounded-full text-sm px-3 py-1.5 border inline-flex items-center gap-1.5",
                    eliminated
                      ? "bg-gray-100 text-gray-400 border-gray-200 line-through"
                      : "bg-brand-50 text-brand-700 border-brand-100",
                  ].join(" ")}
                >
                  <span>
                    {p.nickname}
                    {p.is_leader && " 👑"}
                  </span>
                  {!eliminated && fruitCount !== undefined && (
                    <span className="text-[10px] opacity-80 tabular-nums">
                      🍎{fruitCount}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {inSetup ? (
        <>
          {/* Setup intro */}
          <section className="mt-7">
            <h2 className="text-base font-bold text-gray-900">게임 설정</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              시작 전에 조정해주세요. 게임 중에는 바꿀 수 없어요.
            </p>
          </section>

          {/* Fruit count stepper */}
          <section className="mt-3 rounded-2xl bg-white border border-gray-200 p-5">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                🍎 시작 열매 개수
              </p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                각 팀원에게 지급되는 열매 수예요.
                <br />
                틀리면 1개씩 사라지고, 0이 되면 탈락해요.
              </p>
            </div>

            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => bumpFruits(-1)}
                disabled={fruits <= MIN_FRUITS}
                aria-label="열매 개수 줄이기"
                className="w-11 h-11 rounded-full border border-gray-200 bg-white hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-xl font-semibold text-gray-700 transition"
              >
                −
              </button>

              <div className="flex flex-col items-center min-w-[7rem]">
                <p className="text-4xl font-bold tabular-nums text-gray-900">
                  {fruits}
                </p>
                <p
                  aria-hidden
                  className="mt-1 text-lg leading-none select-none"
                  title={`${fruits}개`}
                >
                  {"🍎".repeat(fruits)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => bumpFruits(1)}
                disabled={fruits >= MAX_FRUITS}
                aria-label="열매 개수 늘리기"
                className="w-11 h-11 rounded-full border border-gray-200 bg-white hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-xl font-semibold text-gray-700 transition"
              >
                +
              </button>
            </div>

            <p className="mt-3 text-[11px] text-gray-400 text-center">
              {MIN_FRUITS}~{MAX_FRUITS}개 사이에서 선택 가능
            </p>
          </section>

          {/* Reference text */}
          <section className="mt-3 rounded-2xl bg-white border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                if (referenceOpen && referenceDirty) {
                  void saveReference();
                }
                setReferenceOpen((v) => !v);
              }}
              className="w-full p-5 flex items-center justify-between gap-3 text-left hover:bg-gray-50 transition"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  📝 참고자료
                  {hasReference && (
                    <span className="inline-flex items-center rounded-full bg-brand-50 text-brand-700 border border-brand-100 text-[10px] font-medium px-2 py-0.5">
                      입력됨
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  지난 주 설교 본문이나 참고할 성경 구절.
                  <br />
                  비워두면 성경 전체 범위에서 출제돼요.
                </p>
              </div>
              <span
                className={[
                  "shrink-0 text-gray-400 transition-transform",
                  referenceOpen ? "rotate-180" : "",
                ].join(" ")}
                aria-hidden
              >
                ▾
              </span>
            </button>

            {referenceOpen && (
              <div className="px-5 pb-5 -mt-1 space-y-3 border-t border-gray-100 pt-4">
                <textarea
                  value={referenceDraft}
                  onChange={(e) => {
                    const v = e.target.value.slice(0, REFERENCE_MAX_CHARS);
                    setReferenceDraft(v);
                    setReferenceDirty(v !== (state.reference_text ?? ""));
                  }}
                  onBlur={saveReference}
                  placeholder="예: 갈라디아서 5:22-23&#10;오직 성령의 열매는 사랑과 희락과 화평과 오래 참음과 자비와 양선과 충성과 온유와 절제니..."
                  rows={6}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-brand-300 focus:ring-2 focus:ring-brand-100 outline-none p-3 text-sm leading-relaxed resize-y transition"
                />
                <div className="flex items-center justify-between text-xs">
                  <span
                    className={[
                      "tabular-nums",
                      refLen > REFERENCE_MAX_CHARS - 200
                        ? "text-orange-600"
                        : "text-gray-400",
                    ].join(" ")}
                  >
                    {refLen.toLocaleString()} /{" "}
                    {REFERENCE_MAX_CHARS.toLocaleString()}자
                  </span>
                  <button
                    type="button"
                    onClick={saveReference}
                    disabled={!referenceDirty || referenceSaving}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium bg-brand-500 hover:bg-brand-600 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition"
                  >
                    {referenceSaving
                      ? "저장 중…"
                      : referenceJustSaved
                      ? "저장됨 ✓"
                      : "저장"}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Summary */}
          <section className="mt-6 rounded-2xl bg-brand-50 border border-brand-100 p-4 text-sm text-brand-900">
            <p className="font-semibold">게임 요약</p>
            <ul className="mt-2 space-y-1 text-xs text-brand-800/90 leading-relaxed">
              <li>
                • 시작 열매:{" "}
                <strong className="tabular-nums">{fruits}</strong>개
              </li>
              <li>
                • 문제 출제 범위:{" "}
                <strong>{hasReference ? "참고자료 기반" : "성경 전체"}</strong>
              </li>
              <li>
                • 참여 팀원:{" "}
                <strong className="tabular-nums">{participants.length}</strong>
                명
              </li>
            </ul>
          </section>

          <button
            type="button"
            disabled={participants.length === 0}
            onClick={startGame}
            className="mt-6 w-full rounded-2xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold py-4 text-base shadow-sm transition"
          >
            {participants.length === 0
              ? "팀원이 입장하면 시작할 수 있어요"
              : "🔔 게임 시작하기"}
          </button>
        </>
      ) : (
        // Game-in-progress placeholder. Stage 3-5b replaces this block with
        // the question-input UI.
        <section className="mt-7 rounded-2xl bg-white border border-gray-200 p-8 text-center">
          <div className="text-5xl mb-3">🎮</div>
          <h2 className="text-lg font-bold text-gray-900">게임 진행 중</h2>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            모든 팀원이 열매 {fruits}개를 받았어요!
            <br />
            다음 단계에서 문제 출제 화면이 추가돼요 🔜
          </p>
          <p className="mt-4 text-xs text-gray-400">
            현재 phase: <span className="font-mono">{phase}</span>
          </p>
        </section>
      )}
    </main>
  );
}
