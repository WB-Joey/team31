"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "./supabase";
import type { SharingLadder } from "./types";

export interface SharingState {
  order: string[] | null; // array of participant ids in speaking order
  index: number;
  ladder: SharingLadder | null;
}

// Fetches sharing_order / sharing_index / sharing_ladder for a session and
// keeps them in sync via realtime UPDATE events on the sessions row.
export function useSharingState(sessionId: string | null) {
  const [state, setState] = useState<SharingState>({
    order: null,
    index: 0,
    ladder: null,
  });

  useEffect(() => {
    if (!sessionId) {
      setState({ order: null, index: 0, ladder: null });
      return;
    }

    const supabase = getSupabaseClient();
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("sessions")
        .select("sharing_order, sharing_index, sharing_ladder")
        .eq("id", sessionId)
        .maybeSingle();
      if (!cancelled && data) {
        setState({
          order: (data.sharing_order as string[] | null) ?? null,
          index: (data.sharing_index as number | null) ?? 0,
          ladder: (data.sharing_ladder as SharingLadder | null) ?? null,
        });
      }
    })();

    const channel = supabase
      .channel(`session-sharing:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as {
            sharing_order: string[] | null;
            sharing_index: number | null;
            sharing_ladder: SharingLadder | null;
          };
          setState({
            order: row.sharing_order ?? null,
            index: row.sharing_index ?? 0,
            ladder: row.sharing_ladder ?? null,
          });
        },
      )
      .subscribe((status) => {
        console.log(`[sharing] channel status: ${status}`);
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return state;
}
