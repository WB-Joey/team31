"use client";

// Hook for reading and writing sessions.quiz_state for a given session.
// Mirrors the shape of lib/useAuctionState.ts so downstream components
// have a familiar interface: const { state, patch } = useQuizState(sessionId).
//
// - Subscribes to realtime UPDATE events on the session row.
// - `patch` does a partial merge on the top-level QuizState keys. For deeper
//   fields (e.g. per-participant entries) callers should build the full merged
//   object and pass it in.
// - Returns a sensible default (defaultQuizState) until the row loads or if
//   quiz_state is stored as an empty object, so consuming components don't
//   have to guard for null at every access.

import { useEffect, useState, useCallback, useRef } from "react";

import { getSupabaseClient } from "@/lib/supabase";
import { defaultQuizState } from "@/lib/quizState";
import type { QuizState } from "@/lib/types";

// Merge a raw jsonb payload onto defaults so old sessions (or sessions whose
// quiz_state hasn't been initialized yet) still present a complete shape.
function normalize(raw: unknown): QuizState {
  const base = defaultQuizState();
  if (!raw || typeof raw !== "object") return base;
  return { ...base, ...(raw as Partial<QuizState>) };
}

export function useQuizState(sessionId: string | null) {
  const [state, setState] = useState<QuizState>(() => defaultQuizState());
  const [loaded, setLoaded] = useState(false);
  // True if the session row had an empty or missing quiz_state at load time,
  // so consumers can persist the defaults back to the DB exactly once.
  const [wasEmpty, setWasEmpty] = useState(false);
  // Track the latest state so patch() can build a merged payload without
  // re-subscribing every time state changes.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!sessionId) return;
    const supabase = getSupabaseClient();
    let cancelled = false;

    // Initial fetch.
    supabase
      .from("sessions")
      .select("quiz_state")
      .eq("id", sessionId)
      .maybeSingle<{ quiz_state: unknown }>()
      .then(({ data }) => {
        if (cancelled) return;
        const raw = data?.quiz_state;
        // Empty object / null / missing all count as "uninitialized".
        const isEmpty =
          !raw ||
          typeof raw !== "object" ||
          Object.keys(raw as object).length === 0;
        setWasEmpty(isEmpty);
        setState(normalize(raw));
        setLoaded(true);
      });

    // Realtime subscription.
    const channel = supabase
      .channel(`quiz_state:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const next = (payload.new as { quiz_state?: unknown })?.quiz_state;
          setState(normalize(next));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Partial merge on top-level QuizState keys. Optimistically updates local
  // state so the UI feels instant; the realtime broadcast will re-sync if the
  // server result differs.
  const patch = useCallback(
    async (delta: Partial<QuizState>) => {
      if (!sessionId) return;
      const next: QuizState = { ...stateRef.current, ...delta };
      setState(next);
      const supabase = getSupabaseClient();
      await supabase
        .from("sessions")
        .update({ quiz_state: next })
        .eq("id", sessionId);
    },
    [sessionId],
  );

  return { state, loaded, wasEmpty, patch };
}
