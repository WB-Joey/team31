"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "./supabase";
import type { ReactionKey } from "./types";

// Row shape matches the Supabase table:
//   reactions(id, session_id, participant_nickname, emoji, created_at)
export interface Reaction {
  id: string;
  session_id: string;
  participant_nickname: string;
  emoji: ReactionKey;
  created_at: string;
}

const POLL_INTERVAL_MS = 4000;

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
        console.error("[reactions] refetch failed", error);
        return;
      }
      setReactions((data ?? []) as Reaction[]);
    }

    refetch();

    const channelName = `reactions:${sessionId}:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
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
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(
            "[reactions] realtime unavailable — run supabase/stage11_migration.sql " +
              "to add `reactions` to the supabase_realtime publication. " +
              "Polling fallback will still keep counts in sync every 4s.",
          );
        }
      });

    const pollId = setInterval(refetch, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [sessionId]);

  return reactions;
}
