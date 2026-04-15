"use client";

import { useEffect, useMemo, useState } from "react";
import type { SharingLadder } from "@/lib/types";

interface Props {
  ladder: SharingLadder;
  nameById: Map<string, string>;
}

// Horizontal/vertical dimensions of the SVG canvas. Column stride scales with
// candidate count via the parent width; viewBox coordinates are fixed here.
const COL_STEP = 70;
const ROW_STEP = 42;
const TOP_Y = 56; // ladder starts below name labels
const LEFT_MARGIN = 40;

function colX(col: number): number {
  return LEFT_MARGIN + col * COL_STEP;
}
function rungY(row: number): number {
  return TOP_Y + (row + 0.5) * ROW_STEP;
}

// Walks the ladder from start_col down through `rows`, taking whichever rung
// (right > left) touches the current column at each row. Returns the waypoint
// list that traces the ball's path.
function computePath(ladder: SharingLadder): { x: number; y: number }[] {
  const { rungs, rows, start_col } = ladder;
  const points: { x: number; y: number }[] = [{ x: colX(start_col), y: 0 }];
  let col = start_col;
  for (let r = 0; r < rows; r++) {
    points.push({ x: colX(col), y: rungY(r) });
    const hasRight = rungs.some((x) => x.col === col && x.row === r);
    const hasLeft = rungs.some((x) => x.col === col - 1 && x.row === r);
    if (hasRight) {
      col = col + 1;
      points.push({ x: colX(col), y: rungY(r) });
    } else if (hasLeft) {
      col = col - 1;
      points.push({ x: colX(col), y: rungY(r) });
    }
  }
  points.push({ x: colX(col), y: TOP_Y + rows * ROW_STEP });
  return points;
}

function interpolate(
  points: { x: number; y: number }[],
  t: number,
): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  let total = 0;
  const segs: { from: { x: number; y: number }; to: { x: number; y: number }; len: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const len = Math.hypot(dx, dy);
    segs.push({ from: points[i - 1], to: points[i], len });
    total += len;
  }
  const target = Math.max(0, Math.min(1, t)) * total;
  let acc = 0;
  for (const s of segs) {
    if (acc + s.len >= target) {
      const local = s.len === 0 ? 0 : (target - acc) / s.len;
      return {
        x: s.from.x + (s.to.x - s.from.x) * local,
        y: s.from.y + (s.to.y - s.from.y) * local,
      };
    }
    acc += s.len;
  }
  return points[points.length - 1];
}

export default function LadderGame({ ladder, nameById }: Props) {
  const cols = ladder.candidates.length;
  const width = LEFT_MARGIN * 2 + Math.max(0, cols - 1) * COL_STEP;
  const bottomY = TOP_Y + ladder.rows * ROW_STEP;
  const height = bottomY + 60;

  const waypoints = useMemo(() => computePath(ladder), [ladder]);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const start = new Date(ladder.started_at).getTime();
    const dur = ladder.duration_ms;
    let raf = 0;
    const tick = () => {
      const now = Date.now();
      const t = Math.max(0, Math.min(1, (now - start) / dur));
      // Ease out cubic for a decelerating drop
      const e = 1 - Math.pow(1 - t, 3);
      setProgress(e);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDone(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ladder.started_at, ladder.duration_ms]);

  const dot = interpolate(waypoints, progress);
  const winnerCol = ladder.candidates.indexOf(ladder.winner_id);

  // Build progressive trail polyline up to the dot
  const trailPoints: { x: number; y: number }[] = [];
  if (waypoints.length > 0) {
    let total = 0;
    for (let i = 1; i < waypoints.length; i++) {
      total += Math.hypot(
        waypoints[i].x - waypoints[i - 1].x,
        waypoints[i].y - waypoints[i - 1].y,
      );
    }
    const target = progress * total;
    let acc = 0;
    trailPoints.push(waypoints[0]);
    for (let i = 1; i < waypoints.length; i++) {
      const len = Math.hypot(
        waypoints[i].x - waypoints[i - 1].x,
        waypoints[i].y - waypoints[i - 1].y,
      );
      if (acc + len <= target) {
        trailPoints.push(waypoints[i]);
        acc += len;
      } else {
        trailPoints.push(dot);
        break;
      }
    }
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-4">
      <p className="text-center text-sm font-semibold text-brand-700 mb-1">
        🎲 사다리타기로 첫 나눔자를 정해요
      </p>
      <p className="text-center text-[11px] text-gray-400 mb-2">
        {done ? "결정됐어요!" : "내려가는 중…"}
      </p>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          className="max-w-full"
          style={{ minWidth: Math.min(width, 520) }}
        >
          {/* Column labels (top) */}
          {ladder.candidates.map((id, i) => (
            <text
              key={`top-${id}`}
              x={colX(i)}
              y={24}
              textAnchor="middle"
              className="fill-gray-700"
              fontSize="12"
              fontWeight="600"
            >
              {nameById.get(id) ?? "?"}
            </text>
          ))}
          {/* Vertical lines */}
          {ladder.candidates.map((id, i) => (
            <line
              key={`v-${id}`}
              x1={colX(i)}
              y1={TOP_Y}
              x2={colX(i)}
              y2={bottomY}
              stroke="#e5e7eb"
              strokeWidth={3}
              strokeLinecap="round"
            />
          ))}
          {/* Rungs */}
          {ladder.rungs.map((r, i) => (
            <line
              key={`r-${i}`}
              x1={colX(r.col)}
              y1={rungY(r.row)}
              x2={colX(r.col + 1)}
              y2={rungY(r.row)}
              stroke="#d1d5db"
              strokeWidth={3}
              strokeLinecap="round"
            />
          ))}
          {/* Trail (progressively drawn) */}
          {trailPoints.length > 1 && (
            <polyline
              points={trailPoints.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#f97316"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {/* Winner column highlight (appears after done) */}
          {done && winnerCol >= 0 && (
            <rect
              x={colX(winnerCol) - 26}
              y={bottomY + 8}
              width={52}
              height={28}
              rx={14}
              fill="#f97316"
            />
          )}
          {/* Bottom labels */}
          {ladder.candidates.map((id, i) => (
            <text
              key={`bot-${id}`}
              x={colX(i)}
              y={bottomY + 27}
              textAnchor="middle"
              fontSize="12"
              fontWeight={done && i === winnerCol ? 700 : 500}
              className={done && i === winnerCol ? "fill-white" : "fill-gray-500"}
            >
              {nameById.get(id) ?? "?"}
            </text>
          ))}
          {/* Moving dot */}
          <circle
            cx={dot.x}
            cy={dot.y}
            r={8}
            fill="#f97316"
            stroke="#fff"
            strokeWidth={3}
          />
        </svg>
      </div>
    </div>
  );
}
