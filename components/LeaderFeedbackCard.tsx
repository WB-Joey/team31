"use client";

import { useMemo, useRef, useState } from "react";
import { REACTIONS } from "@/lib/types";
import type { AuctionState } from "@/lib/types";
import type { Participant } from "@/lib/useParticipants";
import type { Reaction } from "@/lib/useReactions";

interface Props {
  participants: Participant[];
  reactions: Reaction[];
  auctionState: AuctionState;
}

function formatWon(n: number): string {
  return n.toLocaleString("ko-KR");
}

function formatToday(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

interface MemberSummary {
  participantId: string;
  nickname: string;
  wonNames: string[];
  totalSpent: number;
  bidCount: number;
}

export default function LeaderFeedbackCard({
  participants,
  reactions,
  auctionState,
}: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const members = useMemo(() => participants.filter((p) => !p.is_leader), [
    participants,
  ]);

  const reactionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of reactions) counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
    return counts;
  }, [reactions]);

  const summaries = useMemo<MemberSummary[]>(() => {
    return members
      .map((p) => {
        const wonBids = p.bids.filter((b) => b.status === "won");
        const wonNames = wonBids.map((b) => {
          const v = auctionState.values.find((x) => x.id === b.value_id);
          return v?.name ?? "항목";
        });
        const totalSpent = wonBids.reduce((s, b) => s + b.amount, 0);
        return {
          participantId: p.id,
          nickname: p.nickname,
          wonNames,
          totalSpent,
          bidCount: p.bids.length,
        };
      })
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }, [members, auctionState]);

  const totalBids = summaries.reduce((s, m) => s + m.bidCount, 0);
  const totalSpent = summaries.reduce((s, m) => s + m.totalSpent, 0);
  const totalReactions = reactions.length;

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
      a.download = `가치관경매_팀결과_${formatToday()}.png`;
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
            총 <b className="text-gray-800">{members.length}명</b> 참여
          </p>
        </header>

        {/* Reaction totals */}
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

        {/* Per-member summary */}
        <section className="mt-4">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
            팀원별 낙찰
          </p>
          {summaries.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">
              참여 기록이 없어요
            </p>
          ) : (
            <ul className="space-y-1.5">
              {summaries.map((m) => (
                <li
                  key={m.participantId}
                  className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-gray-50 text-sm"
                >
                  <span className="font-semibold shrink-0 w-16 truncate">
                    {m.nickname}
                  </span>
                  <span className="flex-1 min-w-0 text-gray-700">
                    {m.wonNames.length === 0 ? (
                      <span className="text-gray-400">낙찰 없음</span>
                    ) : (
                      m.wonNames.join(", ")
                    )}
                  </span>
                  <span className="tabular-nums text-xs text-gray-500 shrink-0">
                    ₩{formatWon(m.totalSpent)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-5 pt-4 border-t border-gray-100 space-y-1.5 text-sm">
          <p className="flex items-baseline gap-2">
            <span>💰 전체 사용 금액:</span>
            <b className="tabular-nums text-brand-700">
              ₩{formatWon(totalSpent)}
            </b>
          </p>
          <p className="flex items-baseline gap-2">
            <span>✋ 전체 입찰 횟수:</span>
            <b className="tabular-nums">{totalBids}회</b>
          </p>
          <p className="flex items-baseline gap-2">
            <span>😊 전체 반응 수:</span>
            <b className="tabular-nums">{totalReactions}개</b>
          </p>
        </footer>
      </div>

      {err && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {err}
        </p>
      )}

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
