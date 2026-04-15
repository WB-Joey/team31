"use client";

import { useMemo, useState } from "react";
import type { AuctionState, AuctionValue } from "@/lib/types";
import type { Participant } from "@/lib/useParticipants";

interface Props {
  speaker: Participant;
  auctionState: AuctionState;
}

function valueLabel(v: AuctionValue | undefined): string {
  if (!v) return "—";
  return v.name;
}

const COMMON_QUESTIONS = [
  "오늘 경매에서 가장 힘들었던 선택은 무엇이었나요?",
  "다른 사람의 입찰을 보면서 놀랐던 순간이 있었나요?",
  "만약 예산이 2배였다면 어떻게 달라졌을까요?",
  "오늘 경매 결과가 실제 내 삶을 반영한다고 생각하나요?",
];

export default function SharingGuide({ speaker, auctionState }: Props) {
  const [open, setOpen] = useState(true);

  const dataQuestions = useMemo(() => {
    const bids = speaker.bids ?? [];
    if (bids.length === 0) return [] as string[];
    const out: string[] = [];

    // TOP1: largest amount the speaker bid across the session
    const top = [...bids].sort((a, b) => b.amount - a.amount)[0];
    const topValue = auctionState.values.find((v) => v.id === top.value_id);
    if (topValue) {
      out.push(
        `가장 많이 입찰한 가치는 [${valueLabel(topValue)}]이에요. 왜 그 가치가 소중한가요?`,
      );
    }

    // WON: any value the speaker landed
    const won = bids.find((b) => b.status === "won");
    if (won) {
      const v = auctionState.values.find((x) => x.id === won.value_id);
      if (v) {
        out.push(
          `낙찰받은 [${valueLabel(v)}]를 선택한 이유가 있나요?`,
        );
      }
    }

    // LOST: representative lost bid (highest amount lost — felt the most sting)
    const lost = [...bids]
      .filter((b) => b.status === "lost")
      .sort((a, b) => b.amount - a.amount)[0];
    if (lost) {
      const v = auctionState.values.find((x) => x.id === lost.value_id);
      if (v) {
        out.push(
          `[${valueLabel(v)}]를 포기했을 때 어떤 마음이었나요?`,
        );
      }
    }

    return out;
  }, [speaker, auctionState]);

  return (
    <div className="rounded-2xl bg-white border border-gray-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800"
      >
        <span>💬 나눔 가이드</span>
        <span className="text-gray-400 text-xs">{open ? "▲ 접기" : "▼ 펼치기"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {dataQuestions.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-brand-700 mb-1.5">
                📊 {speaker.nickname}님 레포트 기반
              </p>
              <ul className="space-y-1.5">
                {dataQuestions.map((q, i) => (
                  <li
                    key={i}
                    className="rounded-xl bg-brand-50 border border-brand-100 px-3 py-2 text-sm text-gray-800"
                  >
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold text-gray-500 mb-1.5">
              🤔 공통 나눔 질문
            </p>
            <ul className="space-y-1.5">
              {COMMON_QUESTIONS.map((q, i) => (
                <li
                  key={i}
                  className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-sm text-gray-700"
                >
                  {q}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
