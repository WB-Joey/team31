"use client";

// Placeholder shell for 성경퀴즈대회. This version just shows the room code,
// the joined members list, and a "coming soon" message so we can verify that
// routing branches correctly on game_type === 'bible_quiz'. The actual quiz
// gameplay (question drawing, answer submission, fruit/elimination logic,
// reveal phase, confetti, etc.) is added in later stages.

import Link from "next/link";
import { useState } from "react";

import { useParticipants } from "@/lib/useParticipants";

interface Props {
  sessionId: string;
  roomCode: string;
}

export default function QuizGameView({ sessionId, roomCode }: Props) {
  const participants = useParticipants(sessionId);
  const [copied, setCopied] = useState(false);

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
      // Clipboard API may be unavailable over http or in unfocused tab
    }
  }

  return (
    <main className="min-h-screen px-5 pt-6 pb-12 max-w-xl mx-auto overflow-x-hidden">
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

      <section className="mt-8 rounded-2xl bg-white border border-gray-200 p-8 text-center">
        <div className="text-5xl mb-3">🍎</div>
        <h2 className="text-lg font-bold text-gray-900">
          성경퀴즈대회 준비 중
        </h2>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          곧 게임이 시작돼요.
          <br />
          지금은 분기 확인용 임시 화면이에요.
        </p>
      </section>
    </main>
  );
}
