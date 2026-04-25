"use client";

// 성경퀴즈대회 — leader setup panel (stage 3-2).
//
// This replaces the earlier "preparing" placeholder with a real pre-game
// setup screen. Downstream stages add:
//   - the actual question-drawing / answer-reveal UI (stages 3-5 through 3-8)
//   - AI-assisted question generation from reference text (stage 3-9)
//
// Design goals:
//   - Visually match the 가치관 경매 flow: same room-code header, same member
//     pill list, same brand color palette, same rounded-2xl card language.
//   - Leader sees an interactive settings card (fruit count stepper +
//     collapsible reference textarea) and a big orange start button.
//   - Both settings are written to sessions.quiz_state so the eventual
//     member view will see the same configuration via realtime.

import Link from "next/link";
import { useEffect, useState } from "react";

import { useParticipants } from "@/lib/useParticipants";
import { useQuizState } from "@/lib/useQuizState";

interface Props {
  sessionId: string;
  roomCode: string;
}

// Allowed range for starting-fruit count. Matches the memory note: 3 is the
// default, 2~5 is the leader-tunable range.
const MIN_FRUITS = 2;
const MAX_FRUITS = 5;
const REFERENCE_MAX_CHARS = 4000;

export default function QuizGameView({ sessionId, roomCode }: Props) {
  const participants = useParticipants(sessionId);
  const { state, loaded, wasEmpty, patch } = useQuizState(sessionId);

  const [copied, setCopied] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);

  // Local draft for the reference textarea so typing doesn't spam the DB.
  // Flushed to quiz_state when the user blurs the field or collapses the
  // section; also flushed on an explicit "저장" button for clarity.
  const [referenceDraft, setReferenceDraft] = useState("");
  const [referenceDirty, setReferenceDirty] = useState(false);
  const [referenceSaving, setReferenceSaving] = useState(false);
  const [referenceJustSaved, setReferenceJustSaved] = useState(false);

  // When the remote state first loads, seed the textarea. Also keep in sync
  // if another device edits the same session (rare, but cheap to handle).
  useEffect(() => {
    if (!loaded) return;
    if (!referenceDirty) {
      setReferenceDraft(state.reference_text ?? "");
    }
  }, [loaded, state.reference_text, referenceDirty]);

  // If the session just got created, the jsonb column is '{}'. Persist the
  // defaults once so realtime listeners (and the member view) see a fully
  // populated payload. `wasEmpty` is sampled from the first load; subsequent
  // realtime updates won't re-trigger this.
  useEffect(() => {
    if (!loaded || !wasEmpty) return;
    void patch({});
    // We intentionally depend only on `loaded`: once this effect fires for a
    // given session load, it's done. wasEmpty is captured from that load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

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
      // Clipboard API may be unavailable over http or in unfocused tab.
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

  const fruits = state.starting_fruits ?? 3;
  const refLen = referenceDraft.length;
  const hasReference = (state.reference_text ?? "").trim().length > 0;

  return (
    <main className="min-h-screen px-5 pt-6 pb-28 max-w-xl mx-auto overflow-x-hidden">
      <Link
        href="/"
        className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
      >
        ← 홈
      </Link>

      {/* Room code hero — identical language to the auction page */}
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

      {/* Participants — identical language to the auction page */}
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
            {participants.map((p) => (
              <li
                key={p.id}
                className="rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-sm px-3 py-1.5"
              >
                {p.nickname}
                {p.is_leader && " 👑"}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Setup intro */}
      <section className="mt-7">
        <h2 className="text-base font-bold text-gray-900">게임 설정</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          시작 전에 조정해주세요. 게임 중에는 바꿀 수 없어요.
        </p>
      </section>

      {/* Fruit count stepper card */}
      <section className="mt-3 rounded-2xl bg-white border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4">
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

      {/* Reference text — collapsible card */}
      <section className="mt-3 rounded-2xl bg-white border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => {
            if (referenceOpen && referenceDirty) {
              // Auto-save on collapse if there are pending edits.
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
                // Clip at the cap rather than reject the paste outright so
                // long-paste flows feel forgiving.
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
                {refLen.toLocaleString()} / {REFERENCE_MAX_CHARS.toLocaleString()}자
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

      {/* Summary + start button (fixed to bottom visually via pb-28 on main) */}
      <section className="mt-6 rounded-2xl bg-brand-50 border border-brand-100 p-4 text-sm text-brand-900">
        <p className="font-semibold">게임 요약</p>
        <ul className="mt-2 space-y-1 text-xs text-brand-800/90 leading-relaxed">
          <li>• 시작 열매: <strong className="tabular-nums">{fruits}</strong>개</li>
          <li>
            • 문제 출제 범위:{" "}
            <strong>{hasReference ? "참고자료 기반" : "성경 전체"}</strong>
          </li>
          <li>
            • 참여 팀원: <strong className="tabular-nums">{participants.length}</strong>명
          </li>
        </ul>
      </section>

      <button
        type="button"
        disabled={participants.length === 0}
        onClick={() => {
          // Stage 3-2 stops here. Stage 3-5 will wire this up to actually
          // draw the first question and move phase from 'idle' to 'thinking'.
          alert("게임 시작 기능은 다음 단계에서 추가돼요 🔜");
        }}
        className="mt-6 w-full rounded-2xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold py-4 text-base shadow-sm transition"
      >
        {participants.length === 0
          ? "팀원이 입장하면 시작할 수 있어요"
          : "🔔 게임 시작하기"}
      </button>
    </main>
  );
}
