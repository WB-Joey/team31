"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Singleton browser client. Creating a fresh client per call spawns a new
// Realtime WebSocket each time — subscriptions on different instances don't
// share the same socket, and `postgres_changes` events arrive unreliably under
// React StrictMode double-mounts. A single shared instance fixes both.
let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars missing. Copy .env.local.example to .env.local and fill NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  cached = createBrowserClient(url, anonKey);
  return cached;
}
