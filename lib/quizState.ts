// Mirror of lib/auctionState.ts but for the bible quiz content.
// Used by /leader/select to seed sessions.quiz_state when a leader picks
// 성경퀴즈대회 from the catalog.

import type { QuizState } from "@/lib/types";

export function defaultQuizState(startingFruits: number = 3): QuizState {
  return {
    starting_fruits: startingFruits,
    reference_text: "",
    current_question: null,
    phase: "idle",
    thinking_started_at: null,
    thinking_duration_seconds: 30,
    participants: {},
    used_question_ids: [],
    manual_pool: [],
    question_number: 0,
    ended: false,
  };
}
