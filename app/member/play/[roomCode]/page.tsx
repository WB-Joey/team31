"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import MemberAuctionBoard from "@/components/MemberAuctionBoard";
import { getSupabaseClient } from "@/lib/supabase";
import { useAuctionState } from "@/lib/useAuctionState";
import { useParticipants } from "@/lib/useParticipants";
import { useResult } from "@/lib/useResult";
import type { Content } from "@/lib/types";

export default function MemberPlayPage({
  params,
}: {
  params: { roomCode: string };
}) {
  const router = useRouter();
  const roomCode = params.roomCode.toUpperCase();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [myNickname, setMyNickname] = useState<string>("");
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const { result } = useResult(sessionId);

  // Auto-transition to the reveal screen when the leader publishes.
  useEffect(() => {
    if (result) {
      router.replace(`/member/result/${roomCode}`);
    }
  }, [result, router, roomCode]);

  useEffect(() => {
    try {
      setMyNickname(window.localStorage.getItem("member_nickname_v1") ?? "");
      setMyParticipantId(
        window.localStorage.getItem(`participant_id_${roomCode}`),
      );
    } catch {
      // Ignore storage errors
    }

    const supabase = getSupabaseClient();
    supabase
      .from("sessions")
      .select("id, content:contents(*)")
      .eq("room_code", roomCode)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setNotFound(true);
        } else {
          setSessionId(data.id);
          setContent(data.content as unknown as Content);
        }
        setLoading(false);
      });
  }, [roomCode]);

  const participants = useParticipants(sessionId);
  const { state: auctionState } = useAuctionState(sessionId);
  const myParticipant = useMemo(
    () =>
      myParticipantId
        ? participants.find((p) => p.id === myParticipantId) ?? null
        : null,
    [participants, myParticipantId],
  );
  const myBids = myParticipant?.bids ?? [];

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center text-gray-400">
        불러오는 중…
      </main>
    );
  }

  if (notFound || !content || !sessionId) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-3">❓</div>
        <p className="font-semibold mb-1">방을 찾을 수 없어요</p>
        <p className="text-sm text-gray-500 mb-6">룸코드: {roomCode}</p>
        <Link
          href="/member/join"
          className="rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3 text-sm"
        >
          다시 입장하기
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 pt-6 pb-12 max-w-xl mx-auto">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
        >
          ← 홈
        </Link>
        {myNickname && (
          <span className="text-xl font-extrabold text-gray-900">
            {myNickname}님
          </span>
        )}
      </div>

      <section className="mt-4 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white p-5">
        <p className="text-xs opacity-80">오늘의 콘텐츠</p>
        <h1 className="text-2xl font-bold mt-1">{content.title}</h1>
      </section>

      <section className="mt-6">
        <MemberAuctionBoard
          roomCode={roomCode}
          state={auctionState}
          myParticipantId={myParticipantId}
          myBids={myBids}
          participants={participants}
        />
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          함께하는 사람들 ({participants.length}명)
        </h2>
        {participants.length === 0 ? (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">
            아직 다른 팀원이 없어요
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {participants.map((p) => {
              const isMe = p.nickname === myNickname;
              return (
                <li
                  key={p.id}
                  className={[
                    "rounded-full text-sm px-3 py-1.5 border",
                    isMe
                      ? "bg-brand-500 text-white border-brand-500"
                      : "bg-brand-50 text-brand-700 border-brand-100",
                  ].join(" ")}
                >
                  {p.nickname}
                  {p.is_leader && " 👑"}
                  {isMe && " (나)"}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
