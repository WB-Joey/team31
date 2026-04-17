"use client";

import { useEffect, useMemo, useState } from "react";
import type { SharingLadder } from "@/lib/types";

interface Props {
  ladder: SharingLadder;
  nameById: Map<string, string>;
}

// Pastel palette cycled across slices. 20 distinct hues keeps neighbors from
// looking identical even at the maximum candidate count.
const PASTEL_COLORS = [
  "#FFD6E0", "#FFE8C2", "#FFF6B2", "#D9F2C2", "#C2EBD9",
  "#C2E4F2", "#D9D6F2", "#F2C2EB", "#FFDDC2", "#E2F0C2",
  "#FFC2C2", "#C2F2E8", "#D0C2F2", "#F2D4C2", "#FFE4B2",
  "#C8E6C9", "#F8BBD0", "#B2DFDB", "#E1BEE7", "#FFCCBC",
];

const VIEW = 400;
const CX = VIEW / 2;
const CY = VIEW / 2;
const R = 180;

// Slight overshoot past the target so the wheel snaps back at the end.
// Classic "easeOutBack" with a modest s coefficient for a gentle bounce.
function easeOutBack(t: number, s = 1.2): number {
  const c1 = s;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Angle measured from 12 o'clock, clockwise in degrees.
// Point on the circumference: (cx + r·sin θ, cy − r·cos θ).
function polar(cx: number, cy: number, r: number, degFromTop: number) {
  const rad = (degFromTop * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

export default function RouletteWheel({ ladder, nameById }: Props) {
  const N = Math.max(1, ladder.candidates.length);
  const sliceDeg = 360 / N;
  const winnerIdx = Math.max(0, ladder.candidates.indexOf(ladder.winner_id));

  // Total target rotation: several full spins plus the landing offset.
  // Landing offset places the winner's slice center under the top pointer.
  const targetRotation = useMemo(() => {
    const landing = (360 - (winnerIdx + 0.5) * sliceDeg) % 360;
    return 360 * 6 + landing;
  }, [winnerIdx, sliceDeg]);

  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const start = new Date(ladder.started_at).getTime();
    const dur = ladder.duration_ms;
    let raf = 0;
    const tick = () => {
      const now = Date.now();
      const t = Math.max(0, Math.min(1, (now - start) / dur));
      const eased = easeOutBack(t);
      setRotation(targetRotation * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ladder.started_at, ladder.duration_ms, targetRotation]);

  return (
    <div className="relative w-full max-w-[360px] mx-auto aspect-square">
      {/* Fixed pointer at 12 o'clock, pointing downward into the wheel. */}
      <div className="absolute left-1/2 -top-1 -translate-x-1/2 z-10 pointer-events-none">
        <svg viewBox="0 0 40 44" width="40" height="44">
          <path
            d="M 20 40 L 4 8 Q 20 0 36 8 Z"
            fill="#ef4444"
            stroke="#ffffff"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} width="100%" height="100%">
        {/* Outer ring for a polished look */}
        <circle cx={CX} cy={CY} r={R + 8} fill="#1f2937" />
        <circle cx={CX} cy={CY} r={R + 4} fill="#fef3c7" />

        <g
          style={{
            transformOrigin: `${CX}px ${CY}px`,
            transform: `rotate(${rotation}deg)`,
          }}
        >
          {ladder.candidates.map((id, i) => {
            const startDeg = i * sliceDeg;
            const endDeg = (i + 1) * sliceDeg;
            const p1 = polar(CX, CY, R, startDeg);
            const p2 = polar(CX, CY, R, endDeg);
            const largeArc = sliceDeg > 180 ? 1 : 0;
            const path = `M ${CX} ${CY} L ${p1.x} ${p1.y} A ${R} ${R} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
            const color = PASTEL_COLORS[i % PASTEL_COLORS.length];

            // Text placed along the slice's center radius, pre-rotated so the
            // winning slice's label lands upright under the pointer at rest.
            const midDeg = (i + 0.5) * sliceDeg;
            const labelPos = polar(CX, CY, R * 0.62, midDeg);
            const name = nameById.get(id) ?? "?";
            // Flip lower-half labels so they stay right-side-up in rest frame.
            const flip = midDeg > 90 && midDeg < 270;
            const textRotate = flip ? midDeg + 180 : midDeg;

            return (
              <g key={id}>
                <path
                  d={path}
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={N <= 6 ? 18 : N <= 10 ? 15 : 12}
                  fontWeight={700}
                  fill="#1f2937"
                  transform={`rotate(${textRotate} ${labelPos.x} ${labelPos.y})`}
                >
                  {name.length > 6 ? name.slice(0, 6) : name}
                </text>
              </g>
            );
          })}
        </g>

        {/* Hub */}
        <circle cx={CX} cy={CY} r={22} fill="#ffffff" stroke="#1f2937" strokeWidth={3} />
        <circle cx={CX} cy={CY} r={8} fill="#1f2937" />
      </svg>
    </div>
  );
}
