"use client";

import { useMemo, useRef, useState } from "react";
import { REACTIONS } from "@/lib/types";
import type { Encouragement } from "@/lib/useEncouragements";
import type { Participant } from "@/lib/useParticipants";
import type { Reaction } from "@/lib/useReactions";

interface Props {
  leaderNickname: string;
  participants: Participant[];
  reactions: Reaction[];
  encouragements: Encouragement[];
}

function formatToday(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

function formatTodayFile(): string {
  return formatToday().replace(/\./g, "");
}

export default function LeaderFeedbackCard({
  leaderNickname,
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
        scale: 1.5,
        useCORS: true,
        logging: false,
      });
      const fileName = `가치관경매_팀피드백_${formatTodayFile()}.jpg`;

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
          "image/jpeg",
          0.85,
        );
      });

      if (
        typeof navigator !== "undefined" &&
        navigator.share &&
        navigator.canShare?.({ files: [new File([blob], fileName, { type: "image/jpeg" })] })
      ) {
        await navigator.share({
          files: [new File([blob], fileName, { type: "image/jpeg" })],
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") {
        // User cancelled share sheet
      } else {
        console.error("[leader-feedback] download failed", e);
        setErr("이미지 저장에 실패했어요. 브라우저를 새로고침하고 다시 시도해주세요.");
      }
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        ref={cardRef}
        style={{
          background: "#ffffff",
          padding: "24px",
          fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif",
          wordBreak: "keep-all",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
            borderRadius: "16px",
            padding: "24px 20px",
            textAlign: "center",
            color: "#ffffff",
          }}
        >
          <div style={{ fontSize: "14px", opacity: 0.9, marginBottom: "4px" }}>
            🏦 가치관 경매 레포트
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800 }}>
            {leaderNickname || "리더"}님의 팀 피드백
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginTop: "10px", fontSize: "12px", opacity: 0.85 }}>
            <span>{formatToday()}</span>
            <span>·</span>
            <span>참여 {memberCount}명</span>
          </div>
        </div>

        {/* Emoji reactions */}
        <div style={{ marginTop: "20px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#374151", marginBottom: "10px" }}>
            😊 이모지 반응
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px" }}>
            {REACTIONS.map((r) => (
              <div
                key={r.key}
                style={{
                  background: "#fafafa",
                  borderRadius: "14px",
                  padding: "14px 8px",
                  textAlign: "center",
                  border: "1px solid #f3f4f6",
                }}
              >
                <div style={{ fontSize: "28px" }}>{r.emoji}</div>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#1f2937", marginTop: "4px" }}>
                  {reactionCounts[r.key] ?? 0}
                </div>
                <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "2px" }}>
                  {r.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Encouragement messages */}
        <div style={{ marginTop: "20px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#374151", marginBottom: "10px" }}>
            💌 팀원들의 격려 메시지
          </div>
          {messagesNewestFirst.length === 0 ? (
            <div
              style={{
                padding: "24px",
                textAlign: "center",
                fontSize: "13px",
                color: "#9ca3af",
                background: "#fafafa",
                borderRadius: "14px",
              }}
            >
              아직 메시지가 없어요
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {messagesNewestFirst.map((m) => (
                <div
                  key={m.id}
                  style={{
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderRadius: "12px",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#b45309", marginBottom: "4px" }}>
                    💌 {m.participant_nickname}
                  </div>
                  <div style={{ fontSize: "14px", color: "#1f2937", lineHeight: 1.5 }}>
                    &ldquo;{m.message}&rdquo;
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer watermark */}
        <div style={{ marginTop: "18px", textAlign: "center", fontSize: "10px", color: "#d1d5db" }}>
          삼일교회 청년부 사근사근팀 · 가치관 경매
        </div>
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
