"use client";

import { useEffect, useState } from "react";
import RouletteWheel from "./RouletteWheel";
import type { SharingLadder } from "@/lib/types";

interface Props {
  ladder: SharingLadder;
  nameById: Map<string, string>;
  isLeader: boolean;
  myParticipantId: string | null;
  onConfirm: () => void;
  onRerun: () => void;
}

// Full-screen modal that hosts the roulette-wheel animation. Shown while
// `ladder` is non-null in sharing_state. After the reveal animation:
//   - Winner: gets a [나눔 시작하기] button that commits (same effect as
//     the leader's 확인).
//   - Leader: gets [✅ 확인] (commit) and [🎰 다시 돌리기] (rerun).
//   - Other viewers: no popup UI — modal auto-dismisses locally so they see
//     the underlying inline "기대해주세요" text on the page.
// First of winner or leader to commit wins; the global sharing_state update
// flips ladder → null and the modal unmounts everywhere.
export default function LadderModal({
  ladder,
  nameById,
  isLeader,
  myParticipantId,
  onConfirm,
  onRerun,
}: Props) {
  const [revealed, setRevealed] = useState(false);
  const [localDismissed, setLocalDismissed] = useState(false);

  // Reveal the winner row only after the animation completes. Synced to the
  // same clock the wheel uses so every viewer reveals at the same instant.
  useEffect(() => {
    setRevealed(false);
    setLocalDismissed(false);
    const start = new Date(ladder.started_at).getTime();
    const remaining = Math.max(
      0,
      start + ladder.duration_ms - Date.now(),
    );
    const t = setTimeout(() => setRevealed(true), remaining + 200);
    return () => clearTimeout(t);
  }, [ladder.started_at, ladder.duration_ms]);

  const isMeWinner =
    !!myParticipantId && myParticipantId === ladder.winner_id;
  const isViewer = !isLeader && !isMeWinner;

  // Non-winner non-leader viewers get the wheel + brief winner visual and
  // then the modal auto-closes locally — per spec, they see no popup.
  useEffect(() => {
    if (!revealed || !isViewer) return;
    const t = setTimeout(() => setLocalDismissed(true), 1500);
    return () => clearTimeout(t);
  }, [revealed, isViewer]);

  // Fire confetti the moment the winner is revealed.
  useEffect(() => {
    if (!revealed) return;
    let cancelled = false;
    (async () => {
      try {
        const confetti = (await import("canvas-confetti")).default;
        if (cancelled) return;
        confetti({
          particleCount: 120,
          spread: 80,
          startVelocity: 45,
          origin: { y: 0.35 },
        });
        setTimeout(() => {
          if (cancelled) return;
          confetti({
            particleCount: 60,
            angle: 60,
            spread: 70,
            origin: { x: 0, y: 0.5 },
          });
          confetti({
            particleCount: 60,
            angle: 120,
            spread: 70,
            origin: { x: 1, y: 0.5 },
          });
        }, 250);
      } catch {
        // Confetti is best-effort decoration — silent if unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [revealed]);

  if (localDismissed) return null;

  const winnerName = nameById.get(ladder.winner_id) ?? "?";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-3 py-6 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="첫 나눔자 돌림판"
    >
      <div className="w-full max-w-2xl max-h-full overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <header className="px-5 pt-6 pb-2 text-center">
          <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide">
            첫 나눔자 뽑기
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-gray-900">
            🎰 돌림판
          </h2>
        </header>

        <div className="px-4 py-4">
          <RouletteWheel ladder={ladder} nameById={nameById} />
        </div>

        {revealed && isMeWinner && (
          <div className="px-5 pb-6 space-y-4">
            <div className="rounded-2xl p-5 text-center text-white shadow-sm animate-pop-in bg-gradient-to-br from-emerald-500 to-emerald-600">
              <p className="text-sm opacity-90 mb-1">🎉</p>
              <p className="text-2xl font-extrabold">나눌 준비 되셨나요?</p>
              <p className="mt-2 text-xs opacity-90">
                준비되면 팀에게 나눔을 시작해주세요
              </p>
            </div>
            <button
              type="button"
              onClick={onConfirm}
              className="w-full rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold py-4 text-base shadow-sm"
            >
              나눔 시작하기
            </button>
          </div>
        )}

        {revealed && isLeader && !isMeWinner && (
          <div className="px-5 pb-6 space-y-4">
            <div className="rounded-2xl p-5 text-center text-white shadow-sm animate-pop-in bg-gradient-to-br from-brand-500 to-brand-600">
              <p className="text-2xl font-extrabold">
                🎤 {winnerName}님의 나눔을 진행할까요?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onRerun}
                className="rounded-2xl bg-white border-2 border-gray-300 hover:border-brand-400 hover:bg-brand-50 text-gray-700 font-semibold py-4 text-sm shadow-sm"
              >
                🎰 다시 돌리기
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-2xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold py-4 text-sm shadow-sm"
              >
                ✅ 확인
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
