"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "./supabase";
import type { SessionResult } from "./types";

// Fetches the result row for a session (if any) and subscribes to INSERTs.
// Returns null until either the initial fetch or a realtime INSERT arrives.
// `loaded` turns true after the initial fetch so callers can distinguish
// "no result yet" from "still loading".
export function useResult(sessionId: string | null) {
  const [result, setResult] = useState<SessionResult | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setResult(null);
      setLoaded(false);
      return;
    }

    const supabase = getSupabaseClient();
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("results")
        .select("*")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (cancelled) return;
      if (data) setResult(data as SessionResult);
      setLoaded(true);
    })();

    const channel = supabase
      .channel(`results:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "results",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setResult(payload.new as SessionResult);
        },
      )
      .subscribe((status) => {
        console.log(`[result] channel status: ${status}`);
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return { result, loaded };
}
