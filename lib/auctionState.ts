import type { AuctionState, AuctionValue, SpinState } from "./types";

export const CATEGORY_ROMANCE = "연애 · 결혼";
export const CATEGORY_LIFE = "현실 · 성공 · 삶";
export const CATEGORY_GROWTH = "개인 성장 · 내면";
export const CATEGORY_FAITH = "신앙 · 소명";
export const CATEGORY_COMMUNITY = "가족 · 공동체";

export const CATEGORY_EMOJI: Record<string, string> = {
  [CATEGORY_ROMANCE]: "💖",
  [CATEGORY_LIFE]: "💰",
  [CATEGORY_GROWTH]: "🧠",
  [CATEGORY_FAITH]: "🙏",
  [CATEGORY_COMMUNITY]: "👥",
};

export const VALUE_CATEGORIES = [
  CATEGORY_ROMANCE,
  CATEGORY_LIFE,
  CATEGORY_GROWTH,
  CATEGORY_FAITH,
  CATEGORY_COMMUNITY,
] as const;

function mk(id: string, name: string, category: string): AuctionValue {
  return { id, name, category, category_emoji: CATEGORY_EMOJI[category]! };
}

// Full 42-item pool across 5 categories.
export const VALUE_POOL: AuctionValue[] = [
  // 💖 연애 · 결혼 (8 single positive values)
  mk("romance_excitement", "설렘", CATEGORY_ROMANCE),
  mk("romance_trust", "신뢰", CATEGORY_ROMANCE),
  mk("romance_devotion", "헌신", CATEGORY_ROMANCE),
  mk("romance_stability", "안정감", CATEGORY_ROMANCE),
  mk("romance_care", "배려", CATEGORY_ROMANCE),
  mk("romance_humor", "유머", CATEGORY_ROMANCE),
  mk("romance_growing_love", "성장하는 사랑", CATEGORY_ROMANCE),
  mk("romance_eternal_love", "영원한 사랑", CATEGORY_ROMANCE),

  // 💰 현실 · 성공 · 삶 (8)
  mk("success", "성공", CATEGORY_LIFE),
  mk("wealth", "돈(부)", CATEGORY_LIFE),
  mk("time", "시간", CATEGORY_LIFE),
  mk("health", "건강", CATEGORY_LIFE),
  mk("stability", "안정", CATEGORY_LIFE),
  mk("leisure", "여유", CATEGORY_LIFE),
  mk("honor", "명예", CATEGORY_LIFE),
  mk("freedom", "자유", CATEGORY_LIFE),

  // 🧠 개인 성장 · 내면 (11)
  mk("growth", "성장", CATEGORY_GROWTH),
  mk("challenge", "도전", CATEGORY_GROWTH),
  mk("self_esteem", "자존감", CATEGORY_GROWTH),
  mk("temperance", "절제", CATEGORY_GROWTH),
  mk("vision", "목표/비전", CATEGORY_GROWTH),
  mk("diligence", "성실함", CATEGORY_GROWTH),
  mk("confidence", "자신감", CATEGORY_GROWTH),
  mk("achievement", "성취감", CATEGORY_GROWTH),
  mk("patience", "인내", CATEGORY_GROWTH),
  mk("forgiveness", "용서", CATEGORY_GROWTH),
  mk("relationships", "인간관계", CATEGORY_GROWTH),

  // 🙏 신앙 · 소명 (8)
  mk("faith", "믿음", CATEGORY_FAITH),
  mk("mission", "사명", CATEGORY_FAITH),
  mk("devotion", "헌신", CATEGORY_FAITH),
  mk("obedience", "순종", CATEGORY_FAITH),
  mk("service", "섬김", CATEGORY_FAITH),
  mk("worship", "예배", CATEGORY_FAITH),
  mk("prayer", "기도", CATEGORY_FAITH),
  mk("hope", "소망", CATEGORY_FAITH),

  // 👥 가족 · 공동체 (7)
  mk("family", "가족", CATEGORY_COMMUNITY),
  mk("friends", "친구", CATEGORY_COMMUNITY),
  mk("partner", "연인(배우자)", CATEGORY_COMMUNITY),
  mk("love", "사랑", CATEGORY_COMMUNITY),
  mk("friendship", "우정", CATEGORY_COMMUNITY),
  mk("belonging", "소속감", CATEGORY_COMMUNITY),
  mk("trust", "신뢰", CATEGORY_COMMUNITY),
];

// Recommended starter selection — a balanced 15-item spread across all five
// categories. Leader can tweak before committing.
export function recommendedDefaultSelection(): AuctionValue[] {
  const pick = (category: string, names: string[]) =>
    VALUE_POOL.filter(
      (v) => v.category === category && names.includes(v.name),
    );
  return [
    ...pick(CATEGORY_ROMANCE, ["설렘", "신뢰", "영원한 사랑"]),
    ...pick(CATEGORY_LIFE, ["성공", "돈(부)", "건강"]),
    ...pick(CATEGORY_GROWTH, ["성장", "자존감", "성실함"]),
    ...pick(CATEGORY_FAITH, ["믿음", "사명", "섬김"]),
    ...pick(CATEGORY_COMMUNITY, ["가족", "친구", "사랑"]),
  ].map((v) => ({ ...v }));
}

export function defaultAuctionState(): AuctionState {
  return {
    values: [],
    revealed_ids: [],
    current_id: null,
    awarded: {},
    ended: false,
    spin: null,
  };
}

// Rehydrate an auction_state jsonb from the DB, filling missing fields.
export function normalizeAuctionState(raw: unknown): AuctionState {
  const base = defaultAuctionState();
  if (!raw || typeof raw !== "object") return base;
  const s = raw as Partial<AuctionState>;
  const spin =
    s.spin &&
    typeof s.spin === "object" &&
    typeof (s.spin as SpinState).winner_id === "string" &&
    typeof (s.spin as SpinState).started_at === "string" &&
    typeof (s.spin as SpinState).duration_ms === "number"
      ? (s.spin as SpinState)
      : null;
  return {
    values: Array.isArray(s.values) ? (s.values as AuctionValue[]) : [],
    revealed_ids: Array.isArray(s.revealed_ids) ? s.revealed_ids : [],
    current_id: typeof s.current_id === "string" ? s.current_id : null,
    awarded:
      s.awarded && typeof s.awarded === "object"
        ? (s.awarded as AuctionState["awarded"])
        : {},
    ended: Boolean(s.ended),
    spin,
  };
}

export function auctionHasStarted(state: AuctionState): boolean {
  return (
    state.revealed_ids.length > 0 ||
    state.current_id !== null ||
    Object.keys(state.awarded).length > 0
  );
}

export function auctionHasCommitted(state: AuctionState): boolean {
  return state.values.length > 0;
}

export function nextUnrevealedValue(
  state: AuctionState,
): AuctionValue | null {
  const seen = new Set(state.revealed_ids);
  if (state.current_id) seen.add(state.current_id);
  for (const v of state.values) {
    if (!seen.has(v.id)) return v;
  }
  return null;
}

// All values not yet revealed AND not currently up — used by the random-pick
// and the slot-machine cycle pool.
export function unrevealedValues(state: AuctionState): AuctionValue[] {
  const seen = new Set(state.revealed_ids);
  if (state.current_id) seen.add(state.current_id);
  return state.values.filter((v) => !seen.has(v.id));
}

export function makeValueId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Client-local elapsed time for a spin in ms. Returns full duration if spin
// is null — callers gate on the spin itself.
export function spinElapsedMs(spin: SpinState | null): number {
  if (!spin) return 0;
  return Date.now() - new Date(spin.started_at).getTime();
}
