"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "./supabase";
import { normalizeBids, type MemberBid } from "./types";

export interface Participant {
  id: string;
  nickname: string;
  is_leader: boolean;
  created_at: string;
  bids: MemberBid[];
  remaining_budget: number | null;
}

function hydrateParticipant(row: Record<string, unknown>): Participant {
  const rawBudget = row.remaining_budget;
  const remaining_budget =
    typeof rawBudget === "number"
      ? rawBudget
      : typeof rawBudget === "string" && rawBudget.trim() !== ""
        ? Number(rawBudget)
        : null;
  return {
    id: String(row.id),
    nickname: String(row.nickname ?? ""),
    is_leader: Boolean(row.is_leader),
    created_at: String(row.created_at ?? ""),
    bids: normalizeBids(row.bids),
    remaining_budget: Number.isFinite(remaining_budget as number)
      ? (remaining_budget as number)
      : null,
  };
}

const POLL_INTERVAL_MS = 4000;

// Subscribes to participants for a session. Returns a live-updating list.
//
// Strategy:
//   1. Initial fetch to hydrate the UI immediately.
//   2. Supabase Realtime subscription for instant updates on INSERT/UPDATE/DELETE.
//      Each mount gets a uniquely-named channel so React StrictMode double-mounts
//      (dev) can't collide with each other or with a lingering removeChannel.
//   3. Low-frequency polling as a safety net — if Realtime is misconfigured
//      (publication missing, project-level Realtime disabled, flaky network)
//      the list still converges within ~4s.
export function useParticipants(sessionId: string | null) {
  const [participants, setParticipants] = useState<Participant[]>([]);

  useEffect(() => {
    if (!sessionId) {
      setParticipants([]);
      return;
    }

    const supabase = getSupabaseClient();
    let cancelled = false;

    async function refetch() {
      const { data, error } = await supabase
        .from("participants")
        .select(
          "id, nickname, is_leader, created_at, bids, remaining_budget",
        )
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.warn("[participants] refetch failed", error);
        return;
      }
      const next = (data ?? []).map((r) =>
        hydrateParticipant(r as Record<string, unknown>),
      );
      setParticipants(next);
    }

    refetch();

    // Unique channel name per mount so React StrictMode (which mounts effects
    // twice in dev) can't have two subscribers fighting over the same channel.
    const channelName = `participants:${sessionId}:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "participants",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          console.log(
            `[participants] event: ${payload.eventType}`,
            payload,
          );
          if (payload.eventType === "INSERT") {
            const row = hydrateParticipant(
              payload.new as Record<string, unknown>,
            );
            setParticipants((prev) =>
              prev.some((p) => p.id === row.id)
                ? prev
                : [...prev, row].sort((a, b) =>
                    a.created_at.localeCompare(b.created_at),
                  ),
            );
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            setParticipants((prev) => prev.filter((p) => p.id !== oldId));
          } else if (payload.eventType === "UPDATE") {
            const row = hydrateParticipant(
              payload.new as Record<string, unknown>,
            );
            setParticipants((prev) =>
              prev.map((p) => (p.id === row.id ? row : p)),
            );
          }
        },
      )
      .subscribe((status, err) => {
        console.log(`[participants] channel status: ${status}`);
        if (err) {
          console.warn("[participants] channel error", err);
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            "[participants] realtime unavailable — falling back to polling. " +
              "Check that `participants` is in the supabase_realtime publication.",
          );
        }
      });

    const pollId = setInterval(refetch, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      // Must await-ish: removeChannel unsubscribes and tears down the socket
      // listener. Fire-and-forget is fine — the unique channel name ensures the
      // next mount won't collide.
      supabase.removeChannel(channel).catch((e) => {
        console.warn("[participants] removeChannel failed", e);
      });
    };
  }, [sessionId]);

  return participants;
}
