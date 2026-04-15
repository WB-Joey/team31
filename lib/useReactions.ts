"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "./supabase";
import type { ReactionKey } from "./types";

export interface Reaction {
  id: string;
  session_id: string;
  participant_id: string;
  emoji: ReactionKey;
  created_at: string;
}

const POLL_INTERVAL_MS = 4000;

// Fetches the reaction rows for a session and subscribes to INSERT/DELETE.
// 1-per-person at the application layer (leader treats newest as the current
// choice). Polling is a safety net for sessions where Realtime is misconfigured.
export function useReactions(sessionId: string | null) {
  const [reactions, setReactions] = useState<Reaction[]>([]);

  useEffect(() => {
    if (!sessionId) {
      setReactions([]);
      return;
    }

    const supabase = getSupabaseClient();
    let cancelled = false;

    async function refetch() {
      const { data, error } = await supabase
        .from("reactions")
        .select("*")
        .eq("session_id", sessionId);
      if (cancelled) return;
      if (error) {
        console.warn("[reactions] refetch failed", error);
        return;
      }
      setReactions((data ?? []) as Reaction[]);
    }

    refetch();

    const channel = supabase
      .channel(`reactions:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "reactions",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as Reaction;
          setReactions((prev) =>
            prev.some((r) => r.id === row.id) ? prev : [...prev, row],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "reactions",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const oldId = (payload.old as { id: string }).id;
          setReactions((prev) => prev.filter((r) => r.id !== oldId));
        },
      )
      .subscribe((status, err) => {
        console.log(`[reactions] channel status: ${status}`);
        if (err) console.warn("[reactions] channel error", err);
      });

    const pollId = setInterval(refetch, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return reactions;
}
