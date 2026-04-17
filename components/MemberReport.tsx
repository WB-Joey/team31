"use client";

import { useMemo, useRef, useState } from "react";
import type { AuctionState, MemberBid } from "@/lib/types";
import { formatKoreanAmount } from "@/lib/koreanAmount";

interface Props {
  myNickname: string;
  myBids: MemberBid[];
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
    // `won` is derived from the authoritative auctionState (which says who
    // actually won each value) rather than from `bid.status`. localStorage-
    // sourced bids stay as "bidding" because per-bid status transitions
    // happen on the server; matching by winner_nickname keeps the report
    // correct regardless of bid.status.
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

  const mostPreciousName = useMemo(() => {
    if (myBids.length === 0) return "";
    const top = [...myBids].sort((a, b) => b.amount - a.amount)[0];
    const v = auctionState.values.find((x) => x.id === top.value_id);
    if (!v) return "";
    return v.name;
  }, [myBids, auctionState.values]);

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    setErr(null);
    try {
      // Dynamic import — html2canvas is a sizeable dep, only load on demand
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
      a.download = `가치관경매_${myNickname || "나"}_${formatToday()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error("[report] download failed", e);
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
          <p className="text-xl font-extrabold">
            📊 {myNickname || "나"}님의 가치관 경매 레포트
          </p>
        </header>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            입찰 기록이 없어요
          </p>
        ) : (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 px-2 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase">
              <span className="flex-1">가치관</span>
              <span className="w-16 text-right">내 입찰가</span>
              <span className="w-16 text-right">최고입찰가</span>
              <span className="w-14 text-right">결과</span>
            </div>
            <ul className="space-y-1">
              {rows.map((r, i) => (
                <li
                  key={i}
                  className={[
                    "flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm",
                    r.won ? "bg-emerald-50" : "bg-gray-50",
                  ].join(" ")}
                >
                  <span className="flex-1 min-w-0 font-medium truncate">
                    {r.name}
                  </span>
                  <span className="w-16 tabular-nums text-xs text-gray-700 text-right">
                    ₩{formatWon(r.myAmount)}
                  </span>
                  <span className="w-16 tabular-nums text-xs text-gray-500 text-right">
                    ₩{formatWon(r.maxAmount)}
                  </span>
                  <span
                    className={[
                      "w-14 text-right text-[11px] font-semibold whitespace-nowrap",
                      r.won ? "text-emerald-600" : "text-gray-500",
                    ].join(" ")}
                  >
                    {r.won ? "🏆 낙찰" : "😢 유찰"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <footer className="mt-5 pt-4 border-t border-gray-100 space-y-4 text-sm">
          {wonItems.length > 0 && (
            <div>
              <p className="font-semibold text-emerald-700 mb-1.5">
                🏆 낙찰한 가치관
              </p>
              <ul className="space-y-1 pl-1">
                {wonItems.map((r, i) => (
                  <li key={i} className="text-gray-800">
                    • {r.name}{" "}
                    <span className="text-gray-500">
                      ({formatKoreanAmount(r.myAmount)})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lostItems.length > 0 && (
            <div>
              <p className="font-semibold text-gray-600 mb-1.5">
                😢 아쉽게 유찰된 가치관
              </p>
              <ul className="space-y-1 pl-1">
                {lostItems.map((r, i) => (
                  <li key={i} className="text-gray-700">
                    • {r.name}{" "}
                    <span className="text-gray-500">
                      ({formatKoreanAmount(r.myAmount)} 입찰 →{" "}
                      {formatKoreanAmount(r.maxAmount)}에 낙찰)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mostPreciousName && (
            <p className="flex items-baseline gap-2 flex-wrap">
              <span>💡 가장 소중한 가치:</span>
              <span className="font-semibold text-brand-700">
                {mostPreciousName}
              </span>
              <span className="text-[10px] text-gray-400">
                (가장 많이 입찰한 항목)
              </span>
            </p>
          )}

          <p className="flex items-baseline gap-2">
            <span>💰 총 사용 금액:</span>
            <b className="text-brand-700">
              {formatKoreanAmount(totalSpent)}
            </b>
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
        {downloading ? "저장 중…" : "📸 사진첩에 가치관 경매 레포트 저장하기"}
      </button>
    </div>
  );
}
