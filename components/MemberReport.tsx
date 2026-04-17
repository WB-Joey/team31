"use client";

import { useMemo, useRef, useState } from "react";
import type { AuctionState, MemberBid } from "@/lib/types";
import { MEMBER_TOTAL_BUDGET } from "@/lib/budget";
import { formatKoreanAmount } from "@/lib/koreanAmount";

interface Props {
  myNickname: string;
  myBids: MemberBid[];
  auctionState: AuctionState;
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

interface ReportRow {
  name: string;
  myAmount: number;
  maxAmount: number;
  won: boolean;
}

export default function MemberReport({
  myNickname,
  myBids,
  auctionState,
}: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rows = useMemo<ReportRow[]>(() => {
    return myBids
      .map((b) => {
        const v = auctionState.values.find((x) => x.id === b.value_id);
        const award = auctionState.awarded[b.value_id];
        const name = v?.name ?? "항목";
        const won =
          !!award &&
          !!myNickname &&
          award.winner_nickname.trim() === myNickname.trim();
        return {
          name,
          myAmount: b.amount,
          maxAmount: award?.amount ?? b.amount,
          won,
        };
      })
      .sort((a, b) => {
        if (a.won !== b.won) return a.won ? -1 : 1;
        return b.myAmount - a.myAmount;
      });
  }, [myBids, auctionState, myNickname]);

  const totalSpent = rows
    .filter((r) => r.won)
    .reduce((sum, r) => sum + r.myAmount, 0);
  const wonItems = rows.filter((r) => r.won);
  const lostItems = rows.filter((r) => !r.won);
  const remaining = MEMBER_TOTAL_BUDGET - totalSpent;
  const spentRatio = MEMBER_TOTAL_BUDGET > 0 ? totalSpent / MEMBER_TOTAL_BUDGET : 0;

  const top3 = useMemo(() => {
    if (myBids.length === 0) return [];
    return [...myBids]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3)
      .map((b) => {
        const v = auctionState.values.find((x) => x.id === b.value_id);
        return { name: v?.name ?? "항목", amount: b.amount };
      });
  }, [myBids, auctionState.values]);

  const mostPreciousName = top3.length > 0 ? top3[0].name : "";

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
      const fileName = `가치관경매_${myNickname || "나"}_${formatTodayFile()}.jpg`;

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
        // User cancelled the share sheet
      } else {
        console.error("[report] download failed", e);
        setErr("이미지 저장에 실패했어요. 브라우저를 새로고침하고 다시 시도해주세요.");
      }
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* ---- Capturable card ---- */}
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
            {myNickname || "나"}님
          </div>
          <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "8px" }}>
            {formatToday()}
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#9ca3af", fontSize: "14px" }}>
            입찰 기록이 없어요
          </div>
        ) : (
          <>
            {/* Section 1: Budget usage */}
            <div
              style={{
                marginTop: "20px",
                background: "#fafafa",
                borderRadius: "14px",
                padding: "18px",
                border: "1px solid #f3f4f6",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#374151", marginBottom: "14px" }}>
                💰 예산 사용 현황
              </div>
              <div
                style={{
                  height: "14px",
                  borderRadius: "7px",
                  background: "#e5e7eb",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: "7px",
                    background: "linear-gradient(90deg, #f97316, #ea580c)",
                    width: `${Math.min(100, spentRatio * 100)}%`,
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px", fontSize: "12px" }}>
                <div>
                  <span style={{ color: "#9ca3af" }}>사용 </span>
                  <span style={{ color: "#ea580c", fontWeight: 700 }}>{formatKoreanAmount(totalSpent)}</span>
                </div>
                <div>
                  <span style={{ color: "#9ca3af" }}>잔여 </span>
                  <span style={{ color: "#6b7280", fontWeight: 700 }}>{formatKoreanAmount(remaining)}</span>
                </div>
              </div>
              <div style={{ textAlign: "center", marginTop: "4px", fontSize: "11px", color: "#9ca3af" }}>
                총 예산 {formatKoreanAmount(MEMBER_TOTAL_BUDGET)}
              </div>
            </div>

            {/* Section 2: Bid table — stacked layout so names never clip */}
            <div style={{ marginTop: "20px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#374151", marginBottom: "10px" }}>
                📋 입찰 현황
              </div>
              {rows.map((r, i) => (
                <div
                  key={i}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    marginTop: i > 0 ? "6px" : "0",
                    background: r.won ? "#ecfdf5" : "#f9fafb",
                    border: r.won ? "1px solid #a7f3d0" : "1px solid #f3f4f6",
                  }}
                >
                  {/* Row 1: name + result badge */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <div
                      style={{
                        fontSize: "15px",
                        fontWeight: 700,
                        color: "#1f2937",
                        wordBreak: "keep-all",
                        lineHeight: 1.4,
                      }}
                    >
                      {r.name}
                    </div>
                    <div
                      style={{
                        flexShrink: 0,
                        fontSize: "12px",
                        fontWeight: 700,
                        color: r.won ? "#059669" : "#9ca3af",
                        background: r.won ? "#d1fae5" : "#f3f4f6",
                        borderRadius: "6px",
                        padding: "2px 8px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.won ? "🏆 낙찰" : "😢 유찰"}
                    </div>
                  </div>
                  {/* Row 2: amounts */}
                  <div style={{ display: "flex", gap: "16px", marginTop: "6px", fontSize: "12px" }}>
                    <div>
                      <span style={{ color: "#9ca3af" }}>내 입찰 </span>
                      <span style={{ color: "#374151", fontWeight: 600 }}>{formatKoreanAmount(r.myAmount)}</span>
                    </div>
                    <div>
                      <span style={{ color: "#9ca3af" }}>최고가 </span>
                      <span style={{ color: "#6b7280", fontWeight: 600 }}>{formatKoreanAmount(r.maxAmount)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Section 3: Top 3 values */}
            {top3.length > 0 && (
              <div style={{ marginTop: "20px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#374151", marginBottom: "10px" }}>
                  ⭐ 나의 가치관 TOP3
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {top3.map((item, i) => {
                    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
                    const bg = i === 0
                      ? "linear-gradient(135deg, #fef3c7, #fde68a)"
                      : i === 1
                        ? "linear-gradient(135deg, #f3f4f6, #e5e7eb)"
                        : "linear-gradient(135deg, #fed7aa, #fdba74)";
                    return (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          background: bg,
                          borderRadius: "14px",
                          padding: "14px 8px",
                          textAlign: "center",
                        }}
                      >
                        <div style={{ fontSize: "24px" }}>{medal}</div>
                        <div
                          style={{
                            fontSize: "14px",
                            fontWeight: 700,
                            color: "#1f2937",
                            marginTop: "6px",
                            wordBreak: "keep-all",
                            lineHeight: 1.3,
                          }}
                        >
                          {item.name}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#6b7280",
                            marginTop: "4px",
                            fontWeight: 500,
                          }}
                        >
                          {formatKoreanAmount(item.amount)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Section 4: Summary stats 2x2 grid */}
            <div
              style={{
                marginTop: "20px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
              }}
            >
              <StatCard emoji="🏆" label="낙찰" value={`${wonItems.length}개`} color="#059669" />
              <StatCard emoji="😢" label="유찰" value={`${lostItems.length}개`} color="#6b7280" />
              <StatCard emoji="💰" label="총 사용" value={formatKoreanAmount(totalSpent)} color="#ea580c" />
              <StatCard emoji="💡" label="최애 가치" value={mostPreciousName || "-"} color="#7c3aed" />
            </div>

            {/* Footer watermark */}
            <div style={{ marginTop: "18px", textAlign: "center", fontSize: "10px", color: "#d1d5db" }}>
              삼일교회 청년부 사근사근팀 · 가치관 경매
            </div>
          </>
        )}
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
        {downloading ? "저장 중…" : "📸 사진첩에 가치관 경매 레포트 저장하기"}
      </button>
    </div>
  );
}

function StatCard({
  emoji,
  label,
  value,
  color,
}: {
  emoji: string;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: "#fafafa",
        borderRadius: "14px",
        padding: "14px 12px",
        textAlign: "center",
        border: "1px solid #f3f4f6",
      }}
    >
      <div style={{ fontSize: "22px" }}>{emoji}</div>
      <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px", fontWeight: 600 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: "16px",
          fontWeight: 800,
          color,
          marginTop: "4px",
          wordBreak: "keep-all",
          lineHeight: 1.3,
        }}
      >
        {value}
      </div>
    </div>
  );
}
