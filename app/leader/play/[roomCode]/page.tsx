"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const roomCode = params.roomCode.toUpperCase();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("auction");
  const [copied, setCopied] = useState(false);
  const [timerDone, setTimerDone] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);

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
    <main className="min-h-screen px-5 pt-6 pb-12 max-w-xl mx-auto overflow-x-hidden">
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
          {tab === "timer" && (
            <Timer
              blinking={timerDone}
              onDone={() => setTimerDone(true)}
            />
          )}
          {tab === "stopwatch" && <Stopwatch />}
        </div>
      </section>

      {auctionState.ended ? (
        <Link
          href={`/leader/result/${roomCode}`}
          className="mt-10 block w-full text-center rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-semibold py-4 shadow-sm"
        >
          결과 입력하기 →
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => setEndConfirmOpen(true)}
          disabled={ending}
          className="mt-10 w-full rounded-2xl bg-gray-800 hover:bg-gray-900 text-white font-semibold py-4 shadow-sm disabled:opacity-60"
        >
          🏁 경매 종료 &amp; 결과 입력하기
        </button>
      )}

      {endConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={() => setEndConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-lg font-bold text-center">
              경매를 종료하고 결과를 입력할까요?
            </p>
            <p className="mt-2 text-sm text-gray-500 text-center">
              종료하면 더 이상 가치를 공개할 수 없어요
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEndConfirmOpen(false)}
                className="rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 text-sm"
              >
                ❌ 아니요, 계속할게요
              </button>
              <button
                type="button"
                disabled={ending}
                onClick={async () => {
                  setEnding(true);
                  const supabase = getSupabaseClient();
                  await supabase
                    .from("sessions")
                    .update({
                      auction_state: {
                        ...auctionState,
                        ended: true,
                        current_id: null,
                      },
                    })
                    .eq("id", sessionId);
                  setEndConfirmOpen(false);
                  router.push(`/leader/result/${roomCode}`);
                }}
                className="rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 text-sm disabled:opacity-60"
              >
                ✅ 네, 종료할게요
              </button>
            </div>
          </div>
        </div>
      )}

      {timerDone && (
        <TimerDonePopup onClose={() => setTimerDone(false)} />
      )}
    </main>
  );
}

function TimerDonePopup({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch {
        // Vibrate is best-effort.
      }
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-6 text-center animate-pop-in">
        <p className="text-5xl mb-3">🔔</p>
        <h2 className="text-xl font-extrabold text-gray-900">
          타이머가 종료됐어요!
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold py-3.5 text-base shadow-sm"
        >
          확인
        </button>
      </div>
    </div>
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

type GuideSubTab = "mc" | "game";

function ValuesAuctionGuide({ valuesCount }: { valuesCount: number }) {
  const [sub, setSub] = useState<GuideSubTab>("mc");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        <button
          type="button"
          onClick={() => setSub("mc")}
          className={[
            "flex-1 py-2 rounded-lg text-sm font-medium transition",
            sub === "mc" ? "bg-white shadow-sm text-gray-900" : "text-gray-500",
          ].join(" ")}
        >
          🎤 MC 진행 가이드
        </button>
        <button
          type="button"
          onClick={() => setSub("game")}
          className={[
            "flex-1 py-2 rounded-lg text-sm font-medium transition",
            sub === "game" ? "bg-white shadow-sm text-gray-900" : "text-gray-500",
          ].join(" ")}
        >
          📖 경매 게임 가이드
        </button>
      </div>

      {sub === "mc" ? <MCGuide /> : <GameGuide valuesCount={valuesCount} />}
    </div>
  );
}

function MCGuide() {
  const sections: { title: string; items: (string | { quote: string })[] }[] = [
    {
      title: "시작 전",
      items: [
        "팀원들에게 초대 링크/룸코드 공유",
        "전원 입장 확인 후 시작 선언",
        {
          quote:
            "오늘은 가치관 경매를 진행할게요! 각자 1억원의 예산으로 소중한 가치를 낙찰받는 게임이에요 😊",
        },
      ],
    },
    {
      title: "가치 공개 & 입찰",
      items: [
        "가치를 하나씩 공개 (직접 선택 or 랜덤 뽑기)",
        {
          quote:
            "지금 공개된 가치는 OOO입니다. 이 가치, 얼마에 입찰하시겠어요?",
        },
        "팀원들 입찰 확정 대기 → 최고 입찰자 확인",
        { quote: "더 올리실 분 없으신가요? 없으시면 낙찰 처리할게요!" },
        "낙찰 확정 후 다음 가치로 이동",
      ],
    },
    {
      title: "경매 종료 후",
      items: [
        { quote: "모든 경매가 끝났어요! 결과를 공개할게요 🎉" },
        "결과 공개 버튼 클릭",
        { quote: "우승자는 OOO님입니다! 축하해요 👏" },
      ],
    },
    {
      title: "리더에게 한마디",
      items: [
        {
          quote:
            "오늘 함께해줘서 감사해요! 리더에게 따뜻한 한마디 남겨주세요 😊",
        },
        "팀원들 메시지 전송 유도",
      ],
    },
    {
      title: "나눔 시간",
      items: [
        {
          quote:
            "이제 나눔 시간이에요. 돌림판으로 첫 번째 나눔자를 뽑을게요!",
        },
        "돌림판 돌리기 → 선정된 사람부터 나눔 시작",
        "나눔 완료 후 다음 사람 지목",
        { quote: "레포트 사진으로 저장해서 팀 방에 공유해주세요 📸" },
      ],
    },
  ];

  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-5 text-sm leading-relaxed space-y-5">
      <h3 className="text-base font-bold">🎤 MC 진행 흐름</h3>
      {sections.map((section) => (
        <section key={section.title}>
          <p className="text-xs font-semibold text-brand-700 mb-2">
            [{section.title}]
          </p>
          <ul className="space-y-1.5">
            {section.items.map((item, i) =>
              typeof item === "string" ? (
                <li key={i} className="flex gap-2 text-gray-700">
                  <span className="shrink-0 text-brand-500">•</span>
                  <span>{item}</span>
                </li>
              ) : (
                <li
                  key={i}
                  className="rounded-xl bg-brand-50 border border-brand-100 px-3 py-2 text-sm text-gray-800 italic"
                >
                  “{item.quote}”
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

function GameGuide({ valuesCount }: { valuesCount: number }) {
  const rules = [
    "모든 팀원에게 1억원의 가상 예산이 주어져요",
    "리더가 가치관을 하나씩 공개해요",
    "원하는 가치관이 나오면 입찰 금액을 설정하고 [입찰 확정] 버튼을 눌러요",
    "가장 높은 금액을 입찰한 사람이 낙찰받아요",
    "낙찰에 실패하면 입찰 금액은 돌려받아요",
    "예산을 아껴서 정말 소중한 가치관에 집중 투자하세요!",
  ];

  const tips = [
    "모든 가치관을 다 사려고 하면 예산이 부족해요",
    "내가 정말 소중하게 여기는 가치관에 집중하세요",
    "다른 사람의 입찰 금액을 보며 전략을 세워보세요",
  ];

  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-5 text-sm leading-relaxed space-y-5">
      <h3 className="text-base font-bold">📖 가치관 경매 게임 가이드</h3>

      <section>
        <p className="text-xs font-semibold text-gray-500 mb-1.5">게임 목표</p>
        <p className="text-gray-700">
          각자에게 소중한 가치관을 경매로 낙찰받는 활동이에요.
          <br />
          내가 무엇을 가장 소중히 여기는지 발견할 수 있어요!
        </p>
      </section>

      <section>
        <p className="text-xs font-semibold text-gray-500 mb-2">기본 규칙</p>
        <ul className="space-y-1.5">
          {rules.map((r, i) => (
            <li key={i} className="flex gap-2 text-gray-700">
              <span className="shrink-0 text-brand-500">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <p className="text-xs font-semibold text-gray-500 mb-2">팁</p>
        <ul className="space-y-1.5">
          {tips.map((t, i) => (
            <li key={i} className="flex gap-2 text-gray-700">
              <span className="shrink-0">💡</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <p className="text-xs font-semibold text-gray-500 mb-2">승리 조건</p>
        <ol className="space-y-1.5">
          <li className="flex gap-2 text-gray-700">
            <span className="shrink-0 font-semibold text-brand-600">1순위.</span>
            <span>가장 많은 가치관을 낙찰받은 사람</span>
          </li>
          <li className="flex gap-2 text-gray-700">
            <span className="shrink-0 font-semibold text-brand-600">2순위.</span>
            <span>동률 시: 총 사용 금액이 적은 사람 (효율적 입찰)</span>
          </li>
        </ol>
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

function Timer({
  blinking,
  onDone,
}: {
  blinking: boolean;
  onDone: () => void;
}) {
  const [inputMin, setInputMin] = useState(10);
  const [remainingSec, setRemainingSec] = useState(10 * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemainingSec((s) => {
        if (s <= 1) {
          setRunning(false);
          // Defer the parent-state update to the next tick so we don't
          // setState inside another component's updater during React render.
          setTimeout(() => onDoneRef.current(), 0);
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
          done && blinking ? "animate-pulse" : "",
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
