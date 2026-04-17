"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "./supabase";

// Row shape matches the Supabase table:
//   encouragements(id, session_id, participant_nickname, message, created_at)
export interface Encouragement {
  id: string;
  session_id: string;
  participant_nickname: string;
  message: string;
  created_at: string;
}

const POLL_INTERVAL_MS = 4000;

export function useEncouragements(sessionId: string | null) {
  const [encouragements, setEncouragements] = useState<Encouragement[]>([]);

  useEffect(() => {
    if (!sessionId) {
      setEncouragements([]);
      return;
    }

    const supabase = getSupabaseClient();
    let cancelled = false;

    async function refetch() {
      const { data, error } = await supabase
        .from("encouragements")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("[encouragements] refetch failed", error);
        return;
      }
      setEncouragements((data ?? []) as Encouragement[]);
    }

    refetch();

    const channelName = `encouragements:${sessionId}:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "encouragements",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as Encouragement;
          setEncouragements((prev) =>
            prev.some((x) => x.id === row.id) ? prev : [...prev, row],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "encouragements",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const oldId = (payload.old as { id: string }).id;
          setEncouragements((prev) => prev.filter((x) => x.id !== oldId));
        },
      )
      .subscribe((status, err) => {
        console.log(`[encouragements] channel status: ${status}`);
        if (err) console.warn("[encouragements] channel error", err);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(
            "[encouragements] realtime unavailable — run supabase/stage11_migration.sql " +
              "to add `encouragements` to the supabase_realtime publication. " +
              "Polling fallback will still keep messages in sync every 4s.",
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

  return encouragements;
}
