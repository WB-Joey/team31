"use client";

import { useMemo, useRef, useState } from "react";
import { REACTIONS } from "@/lib/types";
import type { Encouragement } from "@/lib/useEncouragements";
import type { Participant } from "@/lib/useParticipants";
import type { Reaction } from "@/lib/useReactions";

interface Props {
  participants: Participant[];
  reactions: Reaction[];
  encouragements: Encouragement[];
}

function formatToday(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

export default function LeaderFeedbackCard({
  participants,
  reactions,
  encouragements,
}: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const memberCount = useMemo(
    () => participants.filter((p) => !p.is_leader).length,
    [participants],
  );

  const reactionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of reactions) counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
    return counts;
  }, [reactions]);

  // Newest-first — newly arrived messages appear at the top via realtime.
  const messagesNewestFirst = useMemo(
    () =>
      [...encouragements].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    [encouragements],
  );

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    setErr(null);
    try {
      const h2c = (await import("html2canvas")).default;
      const canvas = await h2c(cardRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `가치관경매_팀피드백_${formatToday()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error("[leader-feedback] download failed", e);
      setErr("이미지 저장에 실패했어요. 브라우저를 새로고침하고 다시 시도해주세요.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        ref={cardRef}
        className="rounded-3xl bg-white border border-gray-200 p-6 shadow-sm"
      >
        <header className="text-center border-b border-gray-100 pb-4">
          <p className="text-xl font-extrabold">🎯 팀 피드백 레포트</p>
          <p className="mt-1 text-sm text-gray-500">
            총 <b className="text-gray-800">{memberCount}명</b> 참여
          </p>
        </header>

        {/* 1. Emoji reaction counts */}
        <section className="mt-4">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
            이모지 반응
          </p>
          <div className="grid grid-cols-4 gap-2">
            {REACTIONS.map((r) => (
              <div
                key={r.key}
                className="rounded-xl bg-gray-50 px-2 py-3 text-center"
              >
                <div className="text-2xl">{r.emoji}</div>
                <div className="mt-0.5 text-sm font-bold tabular-nums">
                  {reactionCounts[r.key] ?? 0}
                </div>
                <div className="text-[10px] text-gray-400">{r.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 2. Encouragement messages */}
        <section className="mt-5">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
            팀원들의 격려 메시지
          </p>
          {messagesNewestFirst.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400 bg-gray-50 rounded-xl">
              아직 메시지가 없어요
            </p>
          ) : (
            <ul className="space-y-1.5">
              {messagesNewestFirst.map((m) => (
                <li
                  key={m.id}
                  className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-sm"
                >
                  <p className="leading-snug">
                    <span className="font-semibold text-amber-800">
                      💌 {m.participant_nickname}
                    </span>
                    <span className="text-gray-400">: </span>
                    <span className="text-gray-800">“{m.message}”</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {err && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {err}
        </p>
      )}

      {/* 3. Save button */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="w-full rounded-2xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold py-3.5 text-base shadow-sm disabled:opacity-60"
      >
        {downloading ? "저장 중…" : "📸 팀 피드백 저장하기"}
      </button>
    </div>
  );
}
