"use client";

// 성경퀴즈대회 — leader view (stage 3-5b).
//
// Phase routing:
//   - 'idle'                           → setup panel
//   - 'thinking' / 'answers_locked'    → game-in-progress: question composer
//   - 'revealed'                       → reveal screen (stage 3-5e)
//
// 3-5b additions on top of 3-5a:
//   • Question composer card. Leader picks a type (주관식/객관식/OX/넌센스),
//     types the question + accepted answers, and presses 출제.
//   • Pressing 출제 stamps the question into quiz_state.current_question and
//     starts a 30s thinking_started_at timestamp. The actual answer-collection
//     UI for members lands in 3-5c (QuizMemberView).
//   • A '+30초' button is always visible while a question is on the floor;
//     each click extends the timer by 30 seconds.
//
// Question generation is currently fully manual. Stage 3-9 will add a
// "참고자료에서 자동 생성" button that calls the Anthropic API.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useParticipants } from "@/lib/useParticipants";
import { useQuizState } from "@/lib/useQuizState";
import type {
  QuizParticipantState,
  QuizQuestion,
  QuizQuestionType,
} from "@/lib/types";

interface Props {
  sessionId: string;
  roomCode: string;
}

const MIN_FRUITS = 2;
const MAX_FRUITS = 5;
const REFERENCE_MAX_CHARS = 4000;
const DEFAULT_THINKING_SECONDS = 30;
const TIMER_BUMP_SECONDS = 30;

const QUESTION_TYPE_LABELS: Record<QuizQuestionType, string> = {
  subjective: "주관식",
  multiple_choice: "객관식",
  ox: "O / X",
  nonsense: "넌센스 🎁",
};

const QUESTION_TYPE_HELPERS: Record<QuizQuestionType, string> = {
  subjective: "단답형. 정답을 콤마로 여러 개 입력 가능 (예: 사랑, 사랑함)",
  multiple_choice: "4지선다. 보기 4개와 정답 번호(1~4)를 입력하세요",
  ox: "정답을 O 또는 X로 입력하세요",
  nonsense:
    "쉬어가기/패자부활 라운드. 정답자: 생존자 +1열매, 탈락자 부활 (1열매 복귀)",
};

function newParticipantEntry(startingFruits: number): QuizParticipantState {
  return {
    fruits_remaining: startingFruits,
    is_eliminated: false,
    total_correct: 0,
    current_answer: null,
    answer_submitted_at: null,
  };
}

// Generate a short question id. Crypto-randomness isn't needed; this is just
// a key for tracking submitted answers within a round.
function makeQuestionId(): string {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
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

  // Question composer local state. Cleared after each successful 출제.
  const [draftType, setDraftType] = useState<QuizQuestionType>("subjective");
  const [draftText, setDraftText] = useState("");
  const [draftAnswers, setDraftAnswers] = useState("");
  const [draftChoices, setDraftChoices] = useState<string[]>(["", "", "", ""]);
  const [draftCorrectIndex, setDraftCorrectIndex] = useState(0);
  const [composerError, setComposerError] = useState<string | null>(null);

  // Tick once per second so the countdown re-renders. Cheaper than animating.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state.phase !== "thinking") return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [state.phase]);

  useEffect(() => {
    if (!loaded) return;
    if (!referenceDirty) {
      setReferenceDraft(state.reference_text ?? "");
    }
  }, [loaded, state.reference_text, referenceDirty]);

  useEffect(() => {
    if (!loaded || !wasEmpty) return;
    void patch({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Late-join enrollment.
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
    void patch({ participants: { ...existing, ...additions } });
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

  async function startGame() {
    if (participants.length === 0) return;
    const startingFruits = state.starting_fruits ?? 3;
    const seeded: Record<string, QuizParticipantState> = {};
    for (const p of participants) {
      seeded[p.id] =
        state.participants?.[p.id] ?? newParticipantEntry(startingFruits);
    }
    await patch({
      phase: "thinking",
      participants: seeded,
      question_number: 0,
      // Seed thinking timer fields to defaults; they'll be overwritten by the
      // first question submission.
      thinking_started_at: null,
      thinking_duration_seconds: DEFAULT_THINKING_SECONDS,
      current_question: null,
    });
  }

  function resetComposer() {
    setDraftText("");
    setDraftAnswers("");
    setDraftChoices(["", "", "", ""]);
    setDraftCorrectIndex(0);
    setComposerError(null);
  }

  // Validate composer input and produce a QuizQuestion. Returns either the
  // question or an error string the UI can display inline.
  function buildQuestion(): QuizQuestion | string {
    const text = draftText.trim();
    if (!text) return "문제 내용을 입력해주세요.";
    if (draftType === "subjective") {
      const answers = draftAnswers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (answers.length === 0) return "정답을 하나 이상 입력해주세요.";
      return {
        id: makeQuestionId(),
        type: "subjective",
        text,
        answers,
        choices: null,
        source: "manual",
      };
    }
    if (draftType === "ox") {
      const a = draftAnswers.trim().toUpperCase();
      if (a !== "O" && a !== "X") return "정답을 O 또는 X로 입력해주세요.";
      return {
        id: makeQuestionId(),
        type: "ox",
        text,
        answers: [a],
        choices: null,
        source: "manual",
      };
    }
    if (draftType === "multiple_choice") {
      const cleaned = draftChoices.map((c) => c.trim());
      if (cleaned.some((c) => !c))
        return "보기 4개를 모두 입력해주세요.";
      const correct = cleaned[draftCorrectIndex];
      return {
        id: makeQuestionId(),
        type: "multiple_choice",
        text,
        answers: [correct, String(draftCorrectIndex + 1)],
        choices: cleaned,
        source: "manual",
      };
    }
    // nonsense
    const answers = draftAnswers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (answers.length === 0) return "정답을 하나 이상 입력해주세요.";
    return {
      id: makeQuestionId(),
      type: "nonsense",
      text,
      answers,
      choices: null,
      source: "manual",
    };
  }

  async function publishQuestion() {
    const built = buildQuestion();
    if (typeof built === "string") {
      setComposerError(built);
      return;
    }
    setComposerError(null);
    await patch({
      current_question: built,
      phase: "thinking",
      thinking_started_at: new Date().toISOString(),
      thinking_duration_seconds: DEFAULT_THINKING_SECONDS,
      question_number: (state.question_number ?? 0) + 1,
    });
    resetComposer();
  }

  async function bumpTimer() {
    const current = state.thinking_duration_seconds ?? DEFAULT_THINKING_SECONDS;
    await patch({
      thinking_duration_seconds: current + TIMER_BUMP_SECONDS,
    });
  }

  // Compute remaining time live.
  const remainingSeconds = useMemo(() => {
    if (state.phase !== "thinking") return 0;
    const startedAt = state.thinking_started_at;
    const duration =
      state.thinking_duration_seconds ?? DEFAULT_THINKING_SECONDS;
    if (!startedAt) return duration;
    const elapsed = Math.floor(
      (Date.now() - new Date(startedAt).getTime()) / 1000,
    );
    return Math.max(0, duration - elapsed);
    // We deliberately depend on state.thinking_started_at via the tick state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.thinking_started_at, state.thinking_duration_seconds]);

  const fruits = state.starting_fruits ?? 3;
  const refLen = referenceDraft.length;
  const hasReference = (state.reference_text ?? "").trim().length > 0;
  const phase = state.phase ?? "idle";
  const inSetup = phase === "idle";
  const currentQ = state.current_question;
  // True when leader has just started the game but hasn't published a
  // question yet (post startGame, pre first publish).
  const awaitingFirstQuestion = !inSetup && !currentQ;

  return (
    <main className="min-h-screen px-5 pt-6 pb-28 max-w-xl mx-auto overflow-x-hidden">
      <Link
        href="/"
        className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
      >
        ← 홈
      </Link>

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
        <SetupPanel
          fruits={fruits}
          bumpFruits={bumpFruits}
          referenceOpen={referenceOpen}
          setReferenceOpen={setReferenceOpen}
          referenceDraft={referenceDraft}
          setReferenceDraft={setReferenceDraft}
          referenceDirty={referenceDirty}
          setReferenceDirty={setReferenceDirty}
          referenceSaving={referenceSaving}
          referenceJustSaved={referenceJustSaved}
          saveReference={saveReference}
          stateReferenceText={state.reference_text ?? ""}
          refLen={refLen}
          hasReference={hasReference}
          participantsCount={participants.length}
          startGame={startGame}
        />
      ) : (
        <>
          {/* Live question status while a question is on the floor */}
          {currentQ && (
            <section className="mt-5 rounded-2xl bg-white border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-2">
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
              <p className="text-base font-semibold text-gray-900 leading-relaxed">
                {currentQ.text}
              </p>
              {currentQ.type === "multiple_choice" && currentQ.choices && (
                <ul className="mt-3 space-y-1.5">
                  {currentQ.choices.map((c, i) => (
                    <li
                      key={i}
                      className="text-sm text-gray-700 flex items-start gap-2"
                    >
                      <span className="font-semibold text-gray-500">
                        {i + 1}.
                      </span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-gray-500">
                정답:{" "}
                <span className="font-mono text-gray-700">
                  {currentQ.answers.join(" / ")}
                </span>
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={bumpTimer}
                  className="flex-1 rounded-xl border border-brand-200 bg-brand-50 hover:bg-brand-100 text-brand-700 text-sm font-semibold py-2.5 transition"
                >
                  ⏰ 30초 더
                </button>
                <button
                  type="button"
                  onClick={() => alert("정답 공개는 다음 단계에서 추가돼요 🔜")}
                  className="flex-1 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold py-2.5 transition"
                >
                  정답 공개 →
                </button>
              </div>
            </section>
          )}

          {/* Composer: visible while waiting for first question, OR after a
              question is on the floor (so leader can pre-write the next one). */}
          <section className="mt-5">
            <h2 className="text-base font-bold text-gray-900">
              {awaitingFirstQuestion ? "첫 문제 출제하기" : "다음 문제 준비"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              문제 내용과 정답을 입력하고 출제 버튼을 눌러주세요.
            </p>
          </section>

          <section className="mt-3 rounded-2xl bg-white border border-gray-200 p-5 space-y-4">
            {/* Type selector */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">
                문제 타입
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(QUESTION_TYPE_LABELS) as QuizQuestionType[]).map(
                  (t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setDraftType(t);
                        setDraftAnswers("");
                        setComposerError(null);
                      }}
                      className={[
                        "rounded-xl px-3 py-2.5 text-sm font-medium border transition",
                        draftType === t
                          ? "bg-brand-500 text-white border-brand-500"
                          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50",
                      ].join(" ")}
                    >
                      {QUESTION_TYPE_LABELS[t]}
                    </button>
                  ),
                )}
              </div>
              <p className="mt-2 text-[11px] text-gray-500 leading-relaxed">
                {QUESTION_TYPE_HELPERS[draftType]}
              </p>
            </div>

            {/* Question text */}
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">
                문제 내용
              </label>
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder="예: 성령의 9가지 열매 중 빈칸에 들어갈 단어는? '___, 희락, 화평, 오래참음...'"
                rows={3}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-brand-300 focus:ring-2 focus:ring-brand-100 outline-none p-3 text-sm leading-relaxed resize-y transition"
              />
            </div>

            {/* Type-specific answer fields */}
            {draftType === "multiple_choice" ? (
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-2 block">
                  보기 4개 (정답을 선택하세요)
                </label>
                <div className="space-y-2">
                  {draftChoices.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDraftCorrectIndex(i)}
                        aria-label={`보기 ${i + 1}을 정답으로`}
                        className={[
                          "shrink-0 w-9 h-9 rounded-full border text-sm font-semibold transition",
                          draftCorrectIndex === i
                            ? "bg-brand-500 border-brand-500 text-white"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50",
                        ].join(" ")}
                      >
                        {i + 1}
                      </button>
                      <input
                        type="text"
                        value={c}
                        onChange={(e) => {
                          const next = [...draftChoices];
                          next[i] = e.target.value;
                          setDraftChoices(next);
                        }}
                        placeholder={`보기 ${i + 1}`}
                        className="flex-1 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-brand-300 focus:ring-2 focus:ring-brand-100 outline-none px-3 py-2 text-sm transition"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : draftType === "ox" ? (
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-2 block">
                  정답
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["O", "X"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setDraftAnswers(v)}
                      className={[
                        "rounded-xl py-3 text-2xl font-bold border transition",
                        draftAnswers.toUpperCase() === v
                          ? "bg-brand-500 text-white border-brand-500"
                          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50",
                      ].join(" ")}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">
                  정답 (콤마로 여러 개 가능)
                </label>
                <input
                  type="text"
                  value={draftAnswers}
                  onChange={(e) => setDraftAnswers(e.target.value)}
                  placeholder="예: 사랑, 사랑함"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-brand-300 focus:ring-2 focus:ring-brand-100 outline-none p-3 text-sm transition"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  공백/대소문자는 자동으로 무시돼요
                </p>
              </div>
            )}

            {composerError && (
              <p className="rounded-lg bg-orange-50 border border-orange-100 text-orange-700 text-xs p-2.5">
                {composerError}
              </p>
            )}

            <button
              type="button"
              onClick={publishQuestion}
              className="w-full rounded-2xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold py-3.5 text-base shadow-sm transition"
            >
              📢 팀원에게 출제
            </button>
          </section>
        </>
      )}
    </main>
  );
}

// Setup panel extracted for readability. Pure presentational component.
function SetupPanel(props: {
  fruits: number;
  bumpFruits: (delta: number) => void;
  referenceOpen: boolean;
  setReferenceOpen: (fn: (v: boolean) => boolean) => void;
  referenceDraft: string;
  setReferenceDraft: (v: string) => void;
  referenceDirty: boolean;
  setReferenceDirty: (v: boolean) => void;
  referenceSaving: boolean;
  referenceJustSaved: boolean;
  saveReference: () => Promise<void>;
  stateReferenceText: string;
  refLen: number;
  hasReference: boolean;
  participantsCount: number;
  startGame: () => Promise<void>;
}) {
  const {
    fruits,
    bumpFruits,
    referenceOpen,
    setReferenceOpen,
    referenceDraft,
    setReferenceDraft,
    referenceDirty,
    setReferenceDirty,
    referenceSaving,
    referenceJustSaved,
    saveReference,
    stateReferenceText,
    refLen,
    hasReference,
    participantsCount,
    startGame,
  } = props;
  return (
    <>
      <section className="mt-7">
        <h2 className="text-base font-bold text-gray-900">게임 설정</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          시작 전에 조정해주세요. 게임 중에는 바꿀 수 없어요.
        </p>
      </section>

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

      <section className="mt-3 rounded-2xl bg-white border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => {
            if (referenceOpen && referenceDirty) void saveReference();
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
                setReferenceDirty(v !== stateReferenceText);
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

      <section className="mt-6 rounded-2xl bg-brand-50 border border-brand-100 p-4 text-sm text-brand-900">
        <p className="font-semibold">게임 요약</p>
        <ul className="mt-2 space-y-1 text-xs text-brand-800/90 leading-relaxed">
          <li>
            • 시작 열매: <strong className="tabular-nums">{fruits}</strong>개
          </li>
          <li>
            • 문제 출제 범위:{" "}
            <strong>{hasReference ? "참고자료 기반" : "성경 전체"}</strong>
          </li>
          <li>
            • 참여 팀원:{" "}
            <strong className="tabular-nums">{participantsCount}</strong>명
          </li>
        </ul>
      </section>

      <button
        type="button"
        disabled={participantsCount === 0}
        onClick={startGame}
        className="mt-6 w-full rounded-2xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold py-4 text-base shadow-sm transition"
      >
        {participantsCount === 0
          ? "팀원이 입장하면 시작할 수 있어요"
          : "🔔 게임 시작하기"}
      </button>
    </>
  );
}
