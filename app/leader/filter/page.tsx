"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  EMPTY_FILTER,
  FILTER_STORAGE_KEY,
  type LeaderFilter,
} from "@/lib/types";

type Option<T extends string> = { value: T; label: string; hint?: string };

const PEOPLE: Option<NonNullable<LeaderFilter["people"]>>[] = [
  { value: "le5", label: "5명 이하" },
  { value: "6to10", label: "6~10명" },
  { value: "11to15", label: "11~15명" },
  { value: "16to20", label: "16~20명" },
  { value: "gt20", label: "20명 이상" },
];

const VENUE: Option<NonNullable<LeaderFilter["venue"]>>[] = [
  { value: "table_chair", label: "테이블 + 의자" },
  { value: "chair_only", label: "의자만" },
  { value: "floor_outdoor", label: "바닥 · 야외" },
];

const TENSION: Option<NonNullable<LeaderFilter["tension"]>>[] = [
  { value: "low", label: "🔵 차분" },
  { value: "medium", label: "🟡 보통" },
  { value: "high", label: "🔴 하이텐션" },
];

const PLAY_TYPE: Option<NonNullable<LeaderFilter["play_type"]>>[] = [
  { value: "individual", label: "개인전" },
  { value: "team", label: "팀전" },
  { value: "mixed", label: "혼합" },
];

const DURATION: Option<NonNullable<LeaderFilter["duration"]>>[] = [
  { value: "le10", label: "10분 이하" },
  { value: "10to20", label: "10~20분" },
  { value: "20to30", label: "20~30분" },
  { value: "gt30", label: "30분 이상" },
];

const MATERIALS: Option<NonNullable<LeaderFilter["materials"]>>[] = [
  { value: "none", label: "없음" },
  { value: "paper_pen", label: "종이 + 펜" },
  { value: "other", label: "기타 도구" },
];

const ACTIVITY: Option<NonNullable<LeaderFilter["activity_type"]>>[] = [
  { value: "icebreaking", label: "아이스브레이킹" },
  { value: "values", label: "가치관 나눔" },
  { value: "competition", label: "경쟁 게임" },
  { value: "cooperation", label: "협동" },
];

export default function LeaderFilterPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<LeaderFilter>(EMPTY_FILTER);

  // Restore last-used filter from localStorage so leaders don't redo selections.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (raw) setFilter({ ...EMPTY_FILTER, ...JSON.parse(raw) });
    } catch {
      // Ignore corrupt storage — fall back to empty filter.
    }
  }, []);

  function update<K extends keyof LeaderFilter>(
    key: K,
    value: LeaderFilter[K],
  ) {
    setFilter((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filter));
    } catch {
      // Non-fatal: storage may be unavailable (private mode, quota).
    }
    router.push("/leader/select");
  }

  const selectedCount = Object.values(filter).filter((v) => v !== null).length;

  return (
    <main className="min-h-screen px-5 pt-6 pb-36 max-w-xl mx-auto">
      <header className="mb-6">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
        >
          ← 처음으로
        </Link>
        <h1 className="mt-3 text-2xl font-bold">오늘 팀모임, 어떻게 할까요?</h1>
        <p className="mt-1 text-sm text-gray-500">
          아래 항목을 골라주세요. 선택하지 않으면 해당 조건은 무시돼요.
        </p>
      </header>

      <div className="space-y-7">
        <FilterSection title="1. 인원수" subtitle="오늘 몇 명이 모였나요?">
          <CardGrid
            options={PEOPLE}
            selected={filter.people}
            onSelect={(v) => update("people", v)}
          />
        </FilterSection>

        <FilterSection title="2. 장소 환경" subtitle="어디서 모이나요?">
          <CardGrid
            options={VENUE}
            selected={filter.venue}
            onSelect={(v) => update("venue", v)}
          />
        </FilterSection>

        <FilterSection title="3. 텐션" subtitle="오늘 분위기는?">
          <CardGrid
            options={TENSION}
            selected={filter.tension}
            onSelect={(v) => update("tension", v)}
          />
        </FilterSection>

        <FilterSection title="4. 진행 방식">
          <CardGrid
            options={PLAY_TYPE}
            selected={filter.play_type}
            onSelect={(v) => update("play_type", v)}
          />
        </FilterSection>

        <FilterSection title="5. 소요 시간">
          <CardGrid
            options={DURATION}
            selected={filter.duration}
            onSelect={(v) => update("duration", v)}
          />
        </FilterSection>

        <FilterSection title="6. 준비물">
          <CardGrid
            options={MATERIALS}
            selected={filter.materials}
            onSelect={(v) => update("materials", v)}
          />
        </FilterSection>

        <FilterSection title="7. 활동 유형">
          <CardGrid
            options={ACTIVITY}
            selected={filter.activity_type}
            onSelect={(v) => update("activity_type", v)}
          />
        </FilterSection>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-200 px-5 py-4">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setFilter(EMPTY_FILTER)}
            className="px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-100 text-sm font-medium"
          >
            초기화
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex-1 rounded-xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold py-4 text-base shadow-sm transition"
          >
            콘텐츠 찾기{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </button>
        </div>
      </div>
    </main>
  );
}

function FilterSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold">{title}</h2>
      {subtitle ? (
        <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CardGrid<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: Option<T>[];
  selected: T | null;
  onSelect: (v: T | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {options.map((opt) => {
        const isActive = selected === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(isActive ? null : opt.value)}
            className={[
              "rounded-xl px-3 py-4 text-sm font-medium border transition text-center",
              isActive
                ? "bg-brand-500 text-white border-brand-500 shadow-sm"
                : "bg-white text-gray-700 border-gray-200 hover:border-brand-300 hover:bg-brand-50",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
