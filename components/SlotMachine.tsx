"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuctionValue } from "@/lib/types";

const ITEM_HEIGHT = 64; // px — tuned for single-line value names with truncation
const SPIN_COUNT = 22; // length of the fake reel before landing

interface Props {
  winner: AuctionValue;
  // Names to cycle through during the spin. Usually = unrevealed values.
  pool: AuctionValue[];
  // Remaining animation time from the observer's perspective. Late joiners
  // pass a smaller value and get a shorter spin that still lands on winner.
  durationMs: number;
}

// Slot-machine reveal for 🎰 랜덤 뽑기. The reel is randomised per spin and
// ends with the winner; CSS transform + ease-out cubic-bezier gives the
// "fast → slow → stop" feel requested.
export default function SlotMachine({ winner, pool, durationMs }: Props) {
  const reel = useMemo<AuctionValue[]>(() => {
    const source = pool.length > 0 ? pool : [winner];
    const arr: AuctionValue[] = [];
    for (let i = 0; i < SPIN_COUNT; i++) {
      arr.push(source[Math.floor(Math.random() * source.length)]);
    }
    arr.push(winner);
    return arr;
    // Only rebuild when a new spin starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winner.id]);

  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    // Defer by two frames so the browser locks in the initial transform
    // before the new one flips in — otherwise transitions won't fire.
    const id1 = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(() => setRolling(true));
      return () => cancelAnimationFrame(id2);
    });
    return () => cancelAnimationFrame(id1);
  }, []);

  const finalY = -(reel.length - 1) * ITEM_HEIGHT;
  const safeDuration = Math.max(durationMs, 800);
  // Two-phase motion:
  //   1) fast decel to slightly past the winner (overshoot)
  //   2) small spring-back to the winner — reads as a "bounce"
  const overshootPx = 14;
  const phase1 = Math.round(safeDuration * 0.83);
  const phase2 = safeDuration - phase1;
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    if (!rolling) return;
    const t1 = setTimeout(() => setPhase(2), phase1);
    return () => clearTimeout(t1);
  }, [rolling, phase1]);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-sm p-4">
      <div className="flex items-center justify-between text-xs opacity-90 mb-2">
        <span>🎰 랜덤 뽑기 중...</span>
        <span className="animate-pulse">두근두근</span>
      </div>
      <div
        className="relative overflow-hidden rounded-xl bg-white/10"
        style={{ height: ITEM_HEIGHT }}
      >
        <div
          style={{
            transform: !rolling
              ? "translateY(0)"
              : phase === 2
                ? `translateY(${finalY}px)`
                : `translateY(${finalY - overshootPx}px)`,
            transition: !rolling
              ? "none"
              : phase === 2
                ? `transform ${phase2}ms cubic-bezier(0.34, 1.56, 0.64, 1)`
                : `transform ${phase1}ms cubic-bezier(0.12, 0.7, 0.08, 1)`,
            willChange: "transform",
          }}
        >
          {reel.map((v, i) => (
            <div
              key={i}
              style={{ height: ITEM_HEIGHT }}
              className="flex items-center justify-center px-3"
            >
              <span className="text-lg font-bold truncate">
                {v.category_emoji} {displayShort(v)}
              </span>
            </div>
          ))}
        </div>
        {/* Slot-window gradient mask */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-brand-600/80 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-brand-600/80 to-transparent" />
      </div>
    </div>
  );
}

function displayShort(v: AuctionValue): string {
  return v.name;
}
