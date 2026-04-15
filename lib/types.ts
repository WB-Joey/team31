// Shared types that mirror the Supabase schema.
// Kept in one file so both server and client code can import them.

export type TensionLevel = "low" | "medium" | "high";
export type PlayType = "individual" | "team" | "mixed";
export type Materials = "none" | "paper_pen" | "other";
export type ActivityType =
  | "icebreaking"
  | "values"
  | "competition"
  | "cooperation";
export type SessionStatus = "waiting" | "playing" | "result";

export interface Content {
  id: string;
  title: string;
  description: string;
  min_people: number;
  max_people: number;
  requires_table: boolean;
  tension_level: TensionLevel;
  play_type: PlayType;
  duration_min: number;
  needs_materials: Materials;
  activity_type: ActivityType;
  leader_guide: string;
  member_guide: string;
  winner_formula: string;
  created_at: string;
}

// Filter choices the leader picks on /leader/filter.
// Each category is a single-select for MVP; activity_type can be multi.
export type PeopleBucket = "le5" | "6to10" | "11to15" | "16to20" | "gt20";
export type VenueBucket = "table_chair" | "chair_only" | "floor_outdoor";
export type DurationBucket = "le10" | "10to20" | "20to30" | "gt30";

export interface LeaderFilter {
  people: PeopleBucket | null;
  venue: VenueBucket | null;
  tension: TensionLevel | null;
  play_type: PlayType | null;
  duration: DurationBucket | null;
  materials: Materials | null;
  activity_type: ActivityType | null;
}

export const EMPTY_FILTER: LeaderFilter = {
  people: null,
  venue: null,
  tension: null,
  play_type: null,
  duration: null,
  materials: null,
  activity_type: null,
};

export const FILTER_STORAGE_KEY = "leader_filter_v1";

// Reactions shown on the result screen. Keep in sync with the CHECK constraint
// on participants.reaction (see supabase/add_reactions.sql).
export type ReactionKey = "thumbs_up" | "laugh" | "fire" | "sad";

export const REACTIONS: { key: ReactionKey; emoji: string; label: string }[] = [
  { key: "thumbs_up", emoji: "👍", label: "좋아요" },
  { key: "laugh", emoji: "😂", label: "웃겨요" },
  { key: "fire", emoji: "🔥", label: "최고" },
  { key: "sad", emoji: "🥲", label: "아쉬워" },
];

// Shape of a single auction row we persist in results.result_data.
export interface AuctionRow {
  value_name: string;
  winner_nickname: string;
  amount: number;
}

export interface AuctionResultData {
  rows: AuctionRow[];
  tie_manual_pick: boolean;
}

export interface SessionResult {
  id: string;
  session_id: string;
  winner_nickname: string;
  winner_reason: string;
  result_data: AuctionResultData;
  created_at: string;
}

// Ladder-game state used to randomly pick the first speaker for 나눔 time.
// Written once by the leader; all clients animate the same layout via realtime,
// and the leader commits the winner into sharing_order after the animation.
export interface SharingLadder {
  candidates: string[]; // participant IDs, ordered by column (left→right)
  rungs: { row: number; col: number }[]; // rung between col and col+1 at row
  rows: number;
  start_col: number;
  winner_id: string;
  started_at: string; // ISO
  duration_ms: number;
}

// ==============================
// Live auction state (stage 6)
// ==============================
export interface AuctionValue {
  id: string;
  name: string;
  category: string;
  category_emoji: string;
}

// When the leader triggers 🎰 랜덤 뽑기, we write this alongside current_id
// so both sides animate the slot-machine pick in sync via realtime. Clients
// derive remaining animation time from started_at / duration_ms.
export interface SpinState {
  winner_id: string;
  started_at: string; // ISO
  duration_ms: number;
}

export interface AwardedEntry {
  winner_nickname: string;
  amount: number;
  awarded_at: string;
}

export interface AuctionState {
  values: AuctionValue[];
  revealed_ids: string[];
  current_id: string | null;
  awarded: Record<string, AwardedEntry>;
  ended: boolean;
  spin: SpinState | null;
}

// Locked bid on a single value by a participant. Leader transitions status
// to 'won' / 'lost' when awarding; 'lost' returns the amount to the member's
// remaining budget but is retained so the personal report can render history.
export type BidStatus = "bidding" | "won" | "lost";

export interface MemberBid {
  value_id: string;
  amount: number;
  status: BidStatus;
  confirmed_at: string;
}

export function normalizeBids(raw: unknown): MemberBid[] {
  if (!Array.isArray(raw)) return [];
  const out: MemberBid[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const b = item as Partial<MemberBid>;
    if (
      typeof b.value_id !== "string" ||
      typeof b.amount !== "number" ||
      (b.status !== "bidding" && b.status !== "won" && b.status !== "lost") ||
      typeof b.confirmed_at !== "string"
    ) {
      continue;
    }
    out.push({
      value_id: b.value_id,
      amount: b.amount,
      status: b.status,
      confirmed_at: b.confirmed_at,
    });
  }
  return out;
}
