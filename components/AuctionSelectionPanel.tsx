"use client";

import { useMemo, useState } from "react";
import {
  CATEGORY_EMOJI,
  VALUE_CATEGORIES,
  VALUE_POOL,
  makeValueId,
  recommendedDefaultSelection,
} from "@/lib/auctionState";
import type { AuctionValue } from "@/lib/types";
import type { Participant } from "@/lib/useParticipants";

interface Props {
  initial: AuctionValue[];
  saving: boolean;
  participants: Participant[];
  onCommit: (values: AuctionValue[]) => Promise<void> | void;
  onCancel?: () => void;
}

type TabKey = (typeof VALUE_CATEGORIES)[number];

const TABS: TabKey[] = [...VALUE_CATEGORIES];

export default function AuctionSelectionPanel({
  initial,
  saving,
  participants,
  onCommit,
  onCancel,
}: Props) {
  const nonLeaderCount = participants.filter((p) => !p.is_leader).length;
  const recommendedCount = Math.max(1, Math.round(nonLeaderCount * 1.3));
  const [selected, setSelected] = useState<AuctionValue[]>(() =>
    initial.map((v) => ({ ...v })),
  );
  const [tab, setTab] = useState<TabKey>(VALUE_CATEGORIES[0]);
  const [customName, setCustomName] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const selectedIds = useMemo(
    () => new Set(selected.map((v) => v.id)),
    [selected],
  );

  const poolForTab = useMemo<AuctionValue[]>(
    () => VALUE_POOL.filter((v) => v.category === tab),
    [tab],
  );

  const valueCount = selected.length;
  const inRecRange = valueCount === recommendedCount;

  function toggle(v: AuctionValue) {
    setSelected((prev) =>
      prev.some((x) => x.id === v.id)
        ? prev.filter((x) => x.id !== v.id)
        : [...prev, { ...v }],
    );
  }

  function removeAt(id: string) {
    setSelected((prev) => prev.filter((x) => x.id !== id));
  }

  function moveTo(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    setSelected((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }

  function moveUp(i: number) {
    if (i > 0) moveTo(i, i - 1);
  }

  function moveDown(i: number) {
    if (i < selected.length - 1) moveTo(i, i + 1);
  }

  function addCustom() {
    const name = customName.trim();
    if (!name) return;
    setSelected((prev) => [
      ...prev,
      {
        id: makeValueId(),
        name,
        category: tab,
        category_emoji: CATEGORY_EMOJI[tab] ?? "✨",
      },
    ]);
    setCustomName("");
  }

  function fillRecommended() {
    setSelected(recommendedDefaultSelection(recommendedCount));
  }

  function fillAll() {
    setSelected(VALUE_POOL.map((v) => ({ ...v })));
  }

  async function commit() {
    if (selected.length === 0) return;
    await onCommit(selected);
  }

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4">
        <h3 className="text-sm font-semibold">경매 목록 선택</h3>
        <div className="mt-2 flex items-center gap-3 text-sm">
          <span className="tabular-nums">
            선택{" "}
            <b className={inRecRange ? "text-brand-700" : ""}>
              {valueCount}
            </b>
            <span className="text-gray-400">/{VALUE_POOL.length}</span>
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          현재 <b className="text-gray-700">{nonLeaderCount}</b>명 참여 중 → 가치관{" "}
          <b className="text-gray-700">{recommendedCount}</b>개 추천
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={fillRecommended}
            className="rounded-xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold py-3 text-sm shadow-sm"
          >
            ✨ 추천 채우기
          </button>
          <button
            type="button"
            onClick={fillAll}
            className="rounded-xl bg-gray-900 hover:bg-gray-800 active:bg-black text-white font-semibold py-3 text-sm shadow-sm"
          >
            📦 모두 넣기
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map((t) => {
          const active = t === tab;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                "flex-1 min-w-max whitespace-nowrap py-2 px-3 rounded-lg text-xs font-medium transition",
                active
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {CATEGORY_EMOJI[t]} {shortLabel(t)}
            </button>
          );
        })}
      </div>

      {/* Checkbox list for current tab */}
      <div className="rounded-2xl border p-3 bg-white border-gray-200">
        <ul className="space-y-1.5">
          {poolForTab.map((v) => {
            const checked = selectedIds.has(v.id);
            return (
              <li key={v.id}>
                <label
                  className={[
                    "flex items-start gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer transition",
                    checked ? "bg-brand-50" : "hover:bg-gray-50",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(v)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
                  />
                  <span className="text-sm leading-snug">{v.name}</span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="직접 추가 (예: 정직)"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!customName.trim()}
            className="rounded-lg bg-gray-100 hover:bg-gray-200 px-3 text-sm disabled:opacity-50"
          >
            추가
          </button>
        </div>
      </div>

      {/* Selected order list */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">
            공개 순서 ({selected.length})
          </h3>
          <span className="text-xs text-gray-400">
            드래그 또는 ↑↓로 순서 변경
          </span>
        </div>
        {selected.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            위에서 가치관을 선택해주세요
          </p>
        ) : (
          <ul className="space-y-1">
            {selected.map((v, i) => {
              const isBeingDragged = dragIndex === i;
              return (
                <li
                  key={v.id}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(i);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null) moveTo(dragIndex, i);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={[
                    "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition",
                    "bg-gray-50",
                    isBeingDragged ? "opacity-40" : "",
                  ].join(" ")}
                >
                  <span
                    className="text-gray-400 cursor-grab select-none"
                    aria-hidden
                  >
                    ⋮⋮
                  </span>
                  <span className="w-6 text-center text-xs text-gray-500 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="shrink-0">{v.category_emoji}</span>
                  <span className="flex-1 truncate">{v.name}</span>
                  <button
                    type="button"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    aria-label="위로"
                    className="w-7 h-7 rounded text-gray-400 hover:bg-gray-200 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(i)}
                    disabled={i === selected.length - 1}
                    aria-label="아래로"
                    className="w-7 h-7 rounded text-gray-400 hover:bg-gray-200 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAt(v.id)}
                    aria-label="제거"
                    className="w-7 h-7 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl border border-gray-300 text-gray-700 px-4 py-3 text-sm font-medium"
          >
            취소
          </button>
        )}
        <button
          type="button"
          onClick={commit}
          disabled={saving || selected.length === 0}
          className="flex-1 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 disabled:opacity-50"
        >
          {saving ? "저장 중…" : `경매 시작 (${selected.length}개)`}
        </button>
      </div>
    </div>
  );
}

function shortLabel(category: string): string {
  switch (category) {
    case "연애 · 결혼":
      return "연애";
    case "현실 · 성공 · 삶":
      return "현실";
    case "개인 성장 · 내면":
      return "성장";
    case "신앙 · 소명":
      return "신앙";
    case "가족 · 공동체":
      return "공동체";
    default:
      return category;
  }
}
