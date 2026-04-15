"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { normalizeRoomCode } from "@/lib/roomCode";

const NICKNAME_KEY = "member_nickname_v1";

export default function MemberJoinPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(NICKNAME_KEY) ?? "";
  });
  const [roomCode, setRoomCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      setError("닉네임을 입력해주세요");
      return;
    }
    if (roomCode.length !== 6) {
      setError("룸코드 6자리를 입력해주세요");
      return;
    }

    setSubmitting(true);
    const supabase = getSupabaseClient();

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id")
      .eq("room_code", roomCode)
      .maybeSingle();

    if (sessionError) {
      setError(sessionError.message);
      setSubmitting(false);
      return;
    }
    if (!session) {
      setError("해당 룸코드의 방을 찾을 수 없어요");
      setSubmitting(false);
      return;
    }

    const { data: participant, error: joinError } = await supabase
      .from("participants")
      .insert({
        session_id: session.id,
        nickname: trimmedNickname,
        is_leader: false,
      })
      .select("id")
      .single();

    if (joinError || !participant) {
      setError(joinError?.message ?? "입장에 실패했어요");
      setSubmitting(false);
      return;
    }

    try {
      window.localStorage.setItem(NICKNAME_KEY, trimmedNickname);
      window.localStorage.setItem(
        `participant_id_${roomCode}`,
        participant.id,
      );
    } catch {
      // Non-fatal
    }

    router.push(`/member/play/${roomCode}`);
  }

  return (
    <main className="min-h-screen px-5 pt-6 pb-12 max-w-md mx-auto">
      <Link
        href="/"
        className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
      >
        ← 처음으로
      </Link>

      <div className="mt-6 mb-8">
        <h1 className="text-2xl font-bold">방에 입장하기</h1>
        <p className="mt-1 text-sm text-gray-500">
          리더에게 받은 룸코드를 입력해주세요.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            닉네임
          </label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            placeholder="예: 김하늘"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            룸코드 (6자리)
          </label>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(normalizeRoomCode(e.target.value))}
            inputMode="text"
            autoCapitalize="characters"
            placeholder="AB3D7F"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-2xl font-bold tracking-[0.3em] text-center uppercase focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold py-4 text-base shadow-sm transition disabled:opacity-50"
        >
          {submitting ? "입장 중…" : "입장하기"}
        </button>
      </form>
    </main>
  );
}
