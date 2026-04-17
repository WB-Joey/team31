"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MemberReport from "@/components/MemberReport";
import ResultReveal from "@/components/ResultReveal";
import { getSupabaseClient } from "@/lib/supabase";
import { normalizeBids, type Content, type MemberBid } from "@/lib/types";
import { useAuctionState } from "@/lib/useAuctionState";
import { useEncouragements } from "@/lib/useEncouragements";
import { useParticipants } from "@/lib/useParticipants";
import { useReactions } from "@/lib/useReactions";
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
  // Report data is sourced purely from this device's localStorage so a
  // nickname collision on the server (or a leader override) can never make
  // one player see another player's report.
  const [localBids, setLocalBids] = useState<MemberBid[]>([]);

  useEffect(() => {
    try {
      const pid = window.localStorage.getItem(`participant_id_${roomCode}`);
      if (pid) setMyParticipantId(pid);
      // Prefer the room-scoped nickname so two browser tabs testing different
      // players in the same room each resolve to their own participant row.
      // Fall back to the legacy global key for anyone who joined pre-fix.
      const scoped = window.localStorage.getItem(
        `member_nickname_${roomCode}`,
      );
      const global = window.localStorage.getItem("member_nickname_v1");
      const resolvedNickname = scoped ?? global ?? "";
      setMyNickname(resolvedNickname);

      // Report data source — this device's mirrored bid list, written after
      // every successful confirm/cancel during the play phase.
      const rawBids = window.localStorage.getItem(`bids_${roomCode}`);
      const parsedBids = rawBids
        ? normalizeBids(JSON.parse(rawBids))
        : [];
      setLocalBids(parsedBids);

      console.log("[result] localStorage identity", {
        roomCode,
        participantIdKey: `participant_id_${roomCode}`,
        participantId: pid,
        scopedNicknameKey: `member_nickname_${roomCode}`,
        scopedNickname: scoped,
        globalNickname: global,
        resolvedNickname,
        bidsKey: `bids_${roomCode}`,
        bidsRaw: rawBids,
        bidsParsedCount: parsedBids.length,
        bidsParsed: parsedBids,
      });
    } catch (e) {
      console.warn("[result] localStorage read failed", e);
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
  const reactions = useReactions(sessionId);
  const encouragements = useEncouragements(sessionId);
  // Identify the current user primarily by their room-scoped nickname so each
  // browser/device renders its own report. Participant id is a secondary
  // fallback (e.g. legacy joiners whose nickname key wasn't room-scoped).
  const myParticipant = useMemo(() => {
    const trimmed = myNickname.trim();
    let matchedBy: "nickname" | "id" | "none" = "none";
    let chosen = null as typeof participants[number] | null;
    if (trimmed) {
      const byNickname = participants.find(
        (p) => !p.is_leader && p.nickname.trim() === trimmed,
      );
      if (byNickname) {
        chosen = byNickname;
        matchedBy = "nickname";
      }
    }
    if (!chosen && myParticipantId) {
      chosen = participants.find((p) => p.id === myParticipantId) ?? null;
      if (chosen) matchedBy = "id";
    }
    console.log("[result] participant resolution", {
      myNickname: trimmed,
      myParticipantId,
      matchedBy,
      chosenId: chosen?.id,
      chosenNickname: chosen?.nickname,
      chosenIsLeader: chosen?.is_leader,
      chosenBidsCount: chosen?.bids.length ?? 0,
      chosenBids: chosen?.bids,
      allParticipants: participants.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        is_leader: p.is_leader,
        bidsCount: p.bids.length,
      })),
    });
    return chosen;
  }, [participants, myNickname, myParticipantId]);
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

  // Display name in the top-right matches the play screen so the member
  // visually keeps their identity across the navigation. Sourced strictly
  // from localStorage to mirror the play page's source of truth.
  const displayName = myNickname || myParticipant?.nickname || "";

  return (
    <main className="min-h-screen px-5 pt-6 pb-12 max-w-xl mx-auto">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
        >
          ← 홈
        </Link>
        {displayName && (
          <span className="text-xl font-extrabold text-gray-900">
            {displayName}님
          </span>
        )}
      </div>
      <div className="mt-4">
        <ResultReveal
          content={content}
          result={result}
          sessionId={sessionId}
          participants={participants}
          auctionState={auctionState}
          myParticipantId={myParticipant?.id ?? myParticipantId}
          isLeader={false}
          reactions={reactions}
          encouragements={encouragements}
        />
      </div>

      {(() => {
        // Report renders from localStorage nickname + localStorage bids.
        // DB participant lookup is intentionally not used here so that
        // nickname collisions / leader edits can't leak another player's data.
        const reportNickname = myNickname.trim() || myParticipant?.nickname || "";
        const reportBids = localBids.length > 0 ? localBids : myBids;
        console.log("[result] rendering MemberReport with", {
          reportNickname,
          reportBidsSource: localBids.length > 0 ? "localStorage" : "db-fallback",
          reportBidsCount: reportBids.length,
          reportBids,
        });
        if (!reportNickname || reportBids.length === 0) return null;
        return (
          <section className="mt-8">
            <MemberReport
              myNickname={reportNickname}
              myBids={reportBids}
              auctionState={auctionState}
            />
          </section>
        );
      })()}
    </main>
  );
}
