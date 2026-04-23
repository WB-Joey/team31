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
// ==============================
// Bible Quiz state (stage 12) — 성경퀴즈대회 (도전 골든벨)
// ==============================

// Question types. 'nonsense' rounds are bonus/revival rounds: correct answers
// give surviving members +1 fruit and bring eliminated members back with 1 fruit.
// Wrong answers on nonsense rounds do NOT cost a fruit.
export type QuizQuestionType = "subjective" | "multiple_choice" | "ox" | "nonsense";

// Source of the question: pre-entered by MC, generated from reference text,
// or generated from general bible knowledge.
export type QuizQuestionSource = "manual" | "reference" | "bible_general";

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  text: string;
  // Multiple accepted answers. Comparison is done after trim + lowercase +
  // whitespace removal, so "사랑" matches both " 사랑 " and "사랑".
  // For OX, use ["O"] or ["X"]. For multiple_choice, use the choice text(s).
  answers: string[];
  // Only for multiple_choice — the 4 options shown to members.
  choices: string[] | null;
  source: QuizQuestionSource;
}

// Per-participant runtime state during the quiz.
// Indexed by participant.id (uuid) inside QuizState.participants.
export interface QuizParticipantState {
  fruits_remaining: number;
  is_eliminated: boolean;
  total_correct: number;
  // Last submitted answer for the current question, if any.
  // Cleared when MC moves to the next question.
  current_answer: string | null;
  // Timestamp of when the current answer was submitted (for tiebreaks
  // or display order). ISO string.
  answer_submitted_at: string | null;
}

// Phase of the current question lifecycle.
// idle           = no question shown; MC is about to draw one
// thinking       = question is shown, members are answering, timer running
// answers_locked = MC has called for everyone to hold up phones
// revealed       = correct answer is shown; results applied to fruits
export type QuizPhase = "idle" | "thinking" | "answers_locked" | "revealed";

export interface QuizState {
  // Settings (set once when the room is created)
  starting_fruits: number;          // 2~5, default 3
  reference_text: string;            // Optional sermon/scripture context

  // Current question
  current_question: QuizQuestion | null;
  phase: QuizPhase;
  // ISO timestamp when 'thinking' phase started; clients derive
  // remaining time from started_at + duration_seconds.
  thinking_started_at: string | null;
  thinking_duration_seconds: number; // default 30

  // Per-participant fruit/answer state. Key = participants.id (uuid).
  participants: Record<string, QuizParticipantState>;

  // Question history — IDs of questions already shown so we don't repeat
  // when generating from the same reference text pool.
  used_question_ids: string[];

  // Manually entered question pool (optional, MC can pre-load).
  // Drawn first when present; falls back to AI generation when empty.
  manual_pool: QuizQuestion[];

  // Round counter for display (1, 2, 3...)
  question_number: number;

  // Game-over flag set when only one (or zero) participants remain.
  ended: boolean;
}

// Normalize an answer string for comparison: trim, lowercase, collapse
// internal whitespace. Used both client- and server-side.
export function normalizeAnswer(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

// Check whether a submitted answer matches any of the accepted answers.
export function isQuizAnswerCorrect(
  submitted: string,
  acceptedAnswers: string[],
): boolean {
  const norm = normalizeAnswer(submitted);
  if (!norm) return false;
  return acceptedAnswers.some((a) => normalizeAnswer(a) === norm);
}
