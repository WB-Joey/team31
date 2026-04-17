"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "./supabase";
import type { SessionResult } from "./types";

const POLL_INTERVAL_MS = 4000;

// Fetches the result row for a session (if any) and subscribes to INSERTs.
// Returns null until either the initial fetch or a realtime INSERT arrives.
// `loaded` turns true after the initial fetch so callers can distinguish
// "no result yet" from "still loading".
//
// Realtime + 4s polling fallback so the leader's screen still flips into
// reveal mode after publish even when `results` isn't in the
// supabase_realtime publication and the channel reports CHANNEL_ERROR.
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

    async function refetch() {
      const { data, error } = await supabase
        .from("results")
        .select("*")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn("[result] refetch failed", error);
        return;
      }
      if (data) setResult(data as SessionResult);
      setLoaded(true);
    }

    refetch();

    const channelName = `results:${sessionId}:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
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
      .subscribe((status, err) => {
        console.log(`[result] channel status: ${status}`);
        if (err) console.warn("[result] channel error", err);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            "[result] realtime unavailable — polling every 4s instead.",
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

  return { result, loaded };
}
