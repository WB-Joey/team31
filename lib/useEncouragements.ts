"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "./supabase";

export interface Encouragement {
  id: string;
  session_id: string;
  participant_id: string;
  message: string;
  created_at: string;
}

const POLL_INTERVAL_MS = 4000;

// Fetches encouragement rows for a session and subscribes to INSERT/DELETE.
// 1-per-person is enforced at the application layer. Polling guards against
// Realtime outages so the leader view still converges.
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
        console.warn("[encouragements] refetch failed", error);
        return;
      }
      setEncouragements((data ?? []) as Encouragement[]);
    }

    refetch();

    const channel = supabase
      .channel(`encouragements:${sessionId}`)
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
      });

    const pollId = setInterval(refetch, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return encouragements;
}
