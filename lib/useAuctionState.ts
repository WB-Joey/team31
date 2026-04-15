"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "./supabase";
import { defaultAuctionState, normalizeAuctionState } from "./auctionState";
import type { AuctionState } from "./types";

const POLL_INTERVAL_MS = 4000;

// Subscribes to sessions.auction_state for a session. Returns the latest state
// plus a `loaded` flag so consumers can distinguish "still fetching" from
// "fetched — it's just empty".
//
// Uses the same realtime + polling fallback strategy as useParticipants so the
// UI stays converged even if realtime is momentarily flaky.
export function useAuctionState(sessionId: string | null) {
  const [state, setState] = useState<AuctionState>(() => defaultAuctionState());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setState(defaultAuctionState());
      setLoaded(false);
      return;
    }

    const supabase = getSupabaseClient();
    let cancelled = false;

    async function refetch() {
      const { data, error } = await supabase
        .from("sessions")
        .select("auction_state")
        .eq("id", sessionId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn("[auction] refetch failed", error);
        return;
      }
      setState(normalizeAuctionState(data?.auction_state));
      setLoaded(true);
    }

    refetch();

    const channel = supabase
      .channel(`session-auction:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as { auction_state: unknown };
          setState(normalizeAuctionState(row.auction_state));
          setLoaded(true);
        },
      )
      .subscribe((status) => {
        console.log(`[auction] channel status: ${status}`);
      });

    const pollId = setInterval(refetch, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return { state, loaded };
}
