"use client";

// Anonymous leader identifier, stored in localStorage until real auth lands.
// Lets future queries like "my sessions" work without a login screen.
const KEY = "leader_id_v1";

export function getOrCreateLeaderId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}
