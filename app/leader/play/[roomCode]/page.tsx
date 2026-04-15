"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import LeaderAuctionBoard from "@/components/LeaderAuctionBoard";
import MemberBudgetPanel from "@/components/MemberBudgetPanel";
import { getSupabaseClient } from "@/lib/supabase";
import { useAuctionState } from "@/lib/useAuctionState";
import { useParticipants } from "@/lib/useParticipants";
import type { Content } from "@/lib/types";

type Tab = "auction" | "guide" | "timer" | "stopwatch";

export default function LeaderPlayPage({
  params,
}: {
  params: { roomCode: string };
}) {
  const roomCode = params.roomCode.toUpperCase();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("auction");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase
      .from("sessions")
      .select("id, content:contents(*)")
      .eq("room_code", roomCode)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setNotFound(true);
        } else {
          setSessionId(data.id);
          setContent(data.content as unknown as Content);
        }
        setLoading(false);
      });
  }, [roomCode]);

  const participants = useParticipants(sessionId);
  const { state: auctionState } = useAuctionState(sessionId);

  async function copyCode() {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const message = [
      "🎉 오늘 팀모임 콘텐츠가 준비됐어요!",
      "아래 링크로 입장해주세요 😊",
      "",
      `👉 ${appUrl}`,
      `룸코드: ${roomCode}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be unavailable over http or in unfocused tab
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center text-gray-400">
        불러오는 중…
      </main>
    );
  }

  if (notFound || !content || !sessionId) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-3">❓</div>
        <p className="font-semibold mb-1">방을 찾을 수 없어요</p>
        <p className="text-sm text-gray-500 mb-6">룸코드: {roomCode}</p>
        <Link
          href="/leader/filter"
          className="rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3 text-sm"
        >
          새 방 만들기
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 pt-6 pb-12 max-w-xl mx-auto">
      <Link
        href="/"
        className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
      >
        ← 홈
      </Link>

      <section className="mt-3 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white p-5 shadow-sm">
        <p className="text-xs opacity-80">{content.title}</p>
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

      <section className="mt-4">
        <MemberBudgetPanel participants={participants} />
      </section>

      <section className="mt-6">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <TabButton
            active={tab === "auction"}
            onClick={() => setTab("auction")}
          >
            경매 진행
          </TabButton>
          <TabButton active={tab === "guide"} onClick={() => setTab("guide")}>
            가이드
          </TabButton>
          <TabButton active={tab === "timer"} onClick={() => setTab("timer")}>
            타이머
          </TabButton>
          <TabButton
            active={tab === "stopwatch"}
            onClick={() => setTab("stopwatch")}
          >
            스톱워치
          </TabButton>
        </div>

        <div className="mt-4">
          {tab === "auction" && (
            <LeaderAuctionBoard
              sessionId={sessionId}
              state={auctionState}
              participants={participants}
            />
          )}
          {tab === "guide" && (
            <ValuesAuctionGuide valuesCount={auctionState.values.length} />
          )}
          {tab === "timer" && <Timer />}
          {tab === "stopwatch" && <Stopwatch />}
        </div>
      </section>

      <Link
        href={`/leader/result/${roomCode}`}
        className="mt-10 block w-full text-center rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-semibold py-4 shadow-sm"
      >
        결과 입력하기
      </Link>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex-1 py-2.5 rounded-lg text-sm font-medium transition",
        active ? "bg-white shadow-sm text-gray-900" : "text-gray-500",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

const PROGRESS_STEPS = [
  "팀원들에게 룸코드 공유 (초대 메시지 복사 버튼 활용)",
  "팀원 전원 입장 확인",
  "가치관 목록 편집 (필요시)",
  "경매 시작 선언",
  "가치관을 하나씩 공개 (직접 선택 or 랜덤 뽑기)",
  "팀원들 입찰 확정 대기",
  "최고 입찰자 확인 후 낙찰 확정",
  "모든 가치관 진행 후 경매 종료",
  "결과 공개 → 나눔 시간",
];

const CAUTIONS = [
  "팀원들이 입찰 확정 버튼을 눌러야 리더 화면에 반영돼요",
  "낙찰가는 최고 입찰가를 참고해서 입력해주세요",
  "예산이 부족한 팀원은 입찰이 제한될 수 있어요",
  "나눔 시간은 레포트를 보며 진행하면 더 풍성해요",
];

function ValuesAuctionGuide({ valuesCount }: { valuesCount: number }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-5 text-sm leading-relaxed space-y-5">
      <section>
        <h3 className="text-base font-bold mb-2">📋 진행 순서</h3>
        <ol className="space-y-1.5">
          {PROGRESS_STEPS.map((step, i) => (
            <li key={i} className="flex gap-2 text-gray-700">
              <span className="shrink-0 text-brand-600 font-semibold tabular-nums">
                {i + 1}.
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="text-base font-bold mb-2">⚠️ 주의사항</h3>
        <ul className="space-y-1.5">
          {CAUTIONS.map((c, i) => (
            <li key={i} className="flex gap-2 text-gray-700">
              <span className="shrink-0 text-amber-500">•</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl bg-brand-50 border border-brand-100 px-4 py-3 text-center">
        <p className="text-xs text-brand-700 mb-0.5">선택된 가치관</p>
        <p className="text-2xl font-extrabold text-brand-700">
          {valuesCount}개
        </p>
      </section>
    </div>
  );
}

const TIMER_PRESETS = [10, 20, 30, 40, 50, 60];
const TIMER_MIN = 1;
const TIMER_MAX = 180;

function Timer() {
  const [inputMin, setInputMin] = useState(10);
  const [remainingSec, setRemainingSec] = useState(10 * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemainingSec((s) => {
        if (s <= 1) {
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  // Setting the time (stepper/preset) stops the clock and snaps the display
  // so the next 시작 runs for exactly that many minutes.
  function setTime(min: number) {
    const clamped = Math.max(TIMER_MIN, Math.min(TIMER_MAX, min));
    setRunning(false);
    setInputMin(clamped);
    setRemainingSec(clamped * 60);
  }

  function bump(delta: number) {
    setTime(inputMin + delta);
  }

  const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const ss = String(remainingSec % 60).padStart(2, "0");
  const done = remainingSec === 0;

  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-6">
      <div
        className={[
          "text-6xl font-bold tabular-nums tracking-tight text-center",
          done ? "text-red-500" : "text-gray-900",
        ].join(" ")}
      >
        {mm}:{ss}
      </div>

      <div className="mt-6 grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
        <div className="flex justify-end gap-2">
          <StepButton onClick={() => bump(-10)} label="-10분" />
          <StepButton onClick={() => bump(-1)} label="-1분" />
        </div>
        <div className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 text-center min-w-[5rem]">
          <p className="text-[10px] text-gray-400">설정</p>
          <p className="text-xl font-bold tabular-nums">{inputMin}분</p>
        </div>
        <div className="flex justify-start gap-2">
          <StepButton onClick={() => bump(1)} label="+1분" />
          <StepButton onClick={() => bump(10)} label="+10분" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
        {TIMER_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setTime(p)}
            className={[
              "px-3 py-1.5 rounded-full text-xs font-medium border",
              inputMin === p
                ? "bg-brand-500 text-white border-brand-500"
                : "bg-white text-gray-700 border-gray-200 hover:border-brand-300",
            ].join(" ")}
          >
            {p === 60 ? "1시간" : `${p}분`}
          </button>
        ))}
      </div>

      <div className="mt-5 flex gap-2 justify-center">
        {!running ? (
          <button
            type="button"
            onClick={() => {
              setRemainingSec(inputMin * 60);
              setRunning(true);
            }}
            className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold"
          >
            시작
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setRunning(false)}
            className="px-6 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-900 text-white font-semibold"
          >
            일시정지
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setRunning(false);
            setRemainingSec(inputMin * 60);
          }}
          className="px-6 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold"
        >
          초기화
        </button>
      </div>
    </div>
  );
}

function StepButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 tabular-nums"
    >
      {label}
    </button>
  );
}

function Stopwatch() {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const startRef = useRef(0);
  const baseRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    startRef.current = performance.now();
    const tick = () => {
      setElapsedMs(baseRef.current + (performance.now() - startRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      baseRef.current += performance.now() - startRef.current;
    };
  }, [running]);

  const totalSec = Math.floor(elapsedMs / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  const ms = String(Math.floor((elapsedMs % 1000) / 10)).padStart(2, "0");

  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-6 text-center">
      <div className="text-6xl font-bold tabular-nums tracking-tight">
        {mm}:{ss}
        <span className="text-3xl text-gray-400">.{ms}</span>
      </div>
      <div className="mt-5 flex gap-2 justify-center">
        {!running ? (
          <button
            type="button"
            onClick={() => setRunning(true)}
            className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold"
          >
            시작
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setRunning(false)}
            className="px-6 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-900 text-white font-semibold"
          >
            정지
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setRunning(false);
            baseRef.current = 0;
            setElapsedMs(0);
          }}
          className="px-6 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold"
        >
          초기화
        </button>
      </div>
    </div>
  );
}
