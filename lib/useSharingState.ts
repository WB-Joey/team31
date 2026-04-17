"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "./supabase";
import type { SharingLadder } from "./types";

// Persisted shape of `sessions.sharing_state` (jsonb). Replaces the old
// split columns (sharing_order, sharing_index, sharing_ladder).
export type SharingMethod = "random" | "manual";

export interface SharingState {
  order: string[] | null;
  index: number;
  ladder: SharingLadder | null;
  // How the current speaker was selected. "random" = roulette; "manual" = leader pick.
  // null while no selection is active (e.g., before first pick, or after reset).
  method: SharingMethod | null;
}

export const EMPTY_SHARING_STATE: SharingState = {
  order: null,
  index: 0,
  ladder: null,
  method: null,
};

// Parse whatever jsonb blob is stored in sessions.sharing_state into the
// canonical shape. Tolerant of missing fields so pre-migration rows with
// partial data still render safely.
export function normalizeSharingState(raw: unknown): SharingState {
  if (!raw || typeof raw !== "object") return { ...EMPTY_SHARING_STATE };
  const obj = raw as Record<string, unknown>;
  const order = Array.isArray(obj.order)
    ? (obj.order as unknown[]).filter((x): x is string => typeof x === "string")
    : null;
  const index = typeof obj.index === "number" ? obj.index : 0;
  const ladder =
    obj.ladder && typeof obj.ladder === "object"
      ? (obj.ladder as SharingLadder)
      : null;
  const method: SharingMethod | null =
    obj.method === "random" || obj.method === "manual" ? obj.method : null;
  return { order, index, ladder, method };
}

const POLL_INTERVAL_MS = 4000;

// Fetches sharing_state for a session and keeps it in sync.
// Strategy mirrors useParticipants: realtime subscription + 4s polling
// fallback so state converges even if the `sessions` table isn't in the
// supabase_realtime publication.
export function useSharingState(sessionId: string | null) {
  const [state, setState] = useState<SharingState>({ ...EMPTY_SHARING_STATE });

  useEffect(() => {
    if (!sessionId) {
      setState({ ...EMPTY_SHARING_STATE });
      return;
    }

    const supabase = getSupabaseClient();
    let cancelled = false;

    async function refetch() {
      const { data, error } = await supabase
        .from("sessions")
        .select("sharing_state")
        .eq("id", sessionId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("[sharing] refetch failed", error);
        return;
      }
      if (data) {
        setState(normalizeSharingState(data.sharing_state));
      }
    }

    refetch();

    const channelName = `session-sharing:${sessionId}:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as { sharing_state?: unknown };
          setState(normalizeSharingState(row.sharing_state));
        },
      )
      .subscribe((status, err) => {
        console.log(`[sharing] channel status: ${status}`);
        if (err) console.warn("[sharing] channel error", err);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(
            "[sharing] realtime unavailable — falling back to 4s polling. " +
              "Add `sessions` to the supabase_realtime publication to get instant updates.",
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

  return state;
}
