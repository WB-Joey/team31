"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MemberReport from "@/components/MemberReport";
import ResultReveal from "@/components/ResultReveal";
import { getSupabaseClient } from "@/lib/supabase";
import type { Content } from "@/lib/types";
import { useAuctionState } from "@/lib/useAuctionState";
import { useParticipants } from "@/lib/useParticipants";
import { useResult } from "@/lib/useResult";

export default function MemberResultPage({
  params,
}: {
  params: { roomCode: string };
}) {
  const roomCode = params.roomCode.toUpperCase();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);
  const [myNickname, setMyNickname] = useState<string>("");

  useEffect(() => {
    try {
      const pid = window.localStorage.getItem(`participant_id_${roomCode}`);
      if (pid) setMyParticipantId(pid);
      setMyNickname(window.localStorage.getItem("member_nickname_v1") ?? "");
    } catch {
      // Ignore
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
        setLoadingSession(false);
      });
  }, [roomCode]);

  const participants = useParticipants(sessionId);
  const { result, loaded: resultLoaded } = useResult(sessionId);
  const { state: auctionState } = useAuctionState(sessionId);
  const myParticipant = useMemo(
    () =>
      myParticipantId
        ? participants.find((p) => p.id === myParticipantId) ?? null
        : null,
    [participants, myParticipantId],
  );
  const myBids = myParticipant?.bids ?? [];

  if (loadingSession || (!result && !resultLoaded)) {
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

  // Result hasn't been published yet — nudge back to the activity page.
  if (!result) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-3">⏳</div>
        <p className="font-semibold mb-1">아직 결과가 공개되지 않았어요</p>
        <p className="text-sm text-gray-500 mb-6">
          리더가 결과를 공개하면 자동으로 이동합니다.
        </p>
        <Link
          href={`/member/play/${roomCode}`}
          className="rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3 text-sm"
        >
          활동 화면으로
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 pt-6 pb-12 max-w-xl mx-auto">
      <Link
        href="/"
        className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
      >
        ← 홈
      </Link>
      <div className="mt-4">
        <ResultReveal
          content={content}
          result={result}
          sessionId={sessionId}
          participants={participants}
          auctionState={auctionState}
          myParticipantId={myParticipantId}
          isLeader={false}
        />
      </div>

      {myParticipantId && myBids.length > 0 && (
        <section className="mt-8">
          <MemberReport
            myNickname={myNickname || myParticipant?.nickname || ""}
            myBids={myBids}
            auctionState={auctionState}
          />
        </section>
      )}
    </main>
  );
}
