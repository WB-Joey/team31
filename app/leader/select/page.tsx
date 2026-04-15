"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { defaultAuctionState } from "@/lib/auctionState";
import { getSupabaseClient } from "@/lib/supabase";
import { getOrCreateLeaderId } from "@/lib/leaderId";
import { generateRoomCode } from "@/lib/roomCode";
import {
  EMPTY_FILTER,
  FILTER_STORAGE_KEY,
  type Content,
  type LeaderFilter,
  type PeopleBucket,
  type DurationBucket,
} from "@/lib/types";

// Map people bucket → representative group size used to check content range.
const PEOPLE_REPR: Record<PeopleBucket, number> = {
  le5: 5,
  "6to10": 8,
  "11to15": 13,
  "16to20": 18,
  gt20: 25,
};

const DURATION_RANGE: Record<DurationBucket, [number, number]> = {
  le10: [0, 10],
  "10to20": [10, 20],
  "20to30": [20, 30],
  gt30: [30, 9999],
};

const TENSION_LABEL = { low: "🔵 차분", medium: "🟡 보통", high: "🔴 하이텐션" };

export default function LeaderSelectPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<LeaderFilter>(EMPTY_FILTER);
  const [contents, setContents] = useState<Content[] | null>(null);
  // When the filter yields zero results we fall back to showing all contents.
  // This flag flips the header copy so leaders know the filter was ignored.
  const [isFallback, setIsFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  useEffect(() => {
    let loaded = EMPTY_FILTER;
    try {
      const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (raw) loaded = { ...EMPTY_FILTER, ...JSON.parse(raw) };
    } catch {
      // Ignore corrupt storage
    }
    setFilter(loaded);

    const supabase = getSupabaseClient();

    (async () => {
      let q = supabase.from("contents").select("*");

      if (loaded.people) {
        const size = PEOPLE_REPR[loaded.people];
        q = q.lte("min_people", size).gte("max_people", size);
      }
      // If leader has no table available, exclude contents that need one.
      if (loaded.venue && loaded.venue !== "table_chair") {
        q = q.eq("requires_table", false);
      }
      if (loaded.tension) q = q.eq("tension_level", loaded.tension);
      if (loaded.play_type) q = q.eq("play_type", loaded.play_type);
      if (loaded.duration) {
        const [min, max] = DURATION_RANGE[loaded.duration];
        q = q.gte("duration_min", min).lte("duration_min", max);
      }
      if (loaded.materials) q = q.eq("needs_materials", loaded.materials);
      if (loaded.activity_type) q = q.eq("activity_type", loaded.activity_type);

      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      if (data && data.length > 0) {
        setContents(data as Content[]);
        setIsFallback(false);
        setLoading(false);
        return;
      }

      // No matches → fall back to the full catalog so the leader always has options.
      const { data: all, error: allError } = await supabase
        .from("contents")
        .select("*")
        .order("created_at", { ascending: false });
      if (allError) {
        setError(allError.message);
      } else {
        setContents((all ?? []) as Content[]);
        setIsFallback((all ?? []).length > 0);
      }
      setLoading(false);
    })();
  }, []);

  async function handleSelect(content: Content) {
    setCreatingId(content.id);
    setError(null);
    const supabase = getSupabaseClient();
    const leaderId = getOrCreateLeaderId();

    // Try up to 5 times in case of a unique-constraint collision on room_code.
    for (let attempt = 0; attempt < 5; attempt++) {
      const roomCode = generateRoomCode();
      const { error } = await supabase.from("sessions").insert({
        room_code: roomCode,
        content_id: content.id,
        leader_id: leaderId,
        status: "waiting",
        filter_settings: filter,
        auction_state: defaultAuctionState(),
      });

      if (!error) {
        router.push(`/leader/play/${roomCode}`);
        return;
      }
      // 23505 = unique violation — retry with a new code
      if (!(error.code === "23505" && attempt < 4)) {
        setError(error.message);
        setCreatingId(null);
        return;
      }
    }
  }

  return (
    <main className="min-h-screen px-5 pt-6 pb-12 max-w-xl mx-auto">
      <header className="mb-6">
        <Link
          href="/leader/filter"
          className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
        >
          ← 필터 다시 설정
        </Link>
        <h1 className="mt-3 text-2xl font-bold">
          {isFallback ? "딱 맞는 콘텐츠는 없지만, 이건 어때요? 🙂" : "추천 콘텐츠"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {isFallback
            ? "필터 조건에 맞는 콘텐츠가 없어 전체 목록을 보여드려요."
            : "마음에 드는 콘텐츠를 선택하면 방이 만들어져요."}
        </p>
      </header>

      {loading ? (
        <p className="text-center text-gray-400 py-20">불러오는 중…</p>
      ) : error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 p-4 text-sm">
          데이터를 불러오지 못했어요: {error}
        </div>
      ) : contents && contents.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-3">
          {contents?.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => handleSelect(c)}
                disabled={creatingId !== null}
                className="w-full text-left bg-white hover:bg-brand-50 border border-gray-200 hover:border-brand-300 rounded-2xl p-5 shadow-sm transition disabled:opacity-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold">{c.title}</h2>
                  <span className="shrink-0 text-xs bg-brand-100 text-brand-700 px-2 py-1 rounded-full">
                    {TENSION_LABEL[c.tension_level]}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                  {c.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-gray-500">
                  <Badge>⏱ {c.duration_min}분</Badge>
                  <Badge>
                    👥 {c.min_people}~{c.max_people}명
                  </Badge>
                  {c.needs_materials !== "none" && (
                    <Badge>
                      📝 {c.needs_materials === "paper_pen" ? "종이+펜" : "기타 도구"}
                    </Badge>
                  )}
                </div>
                {creatingId === c.id && (
                  <p className="mt-3 text-xs text-brand-600">방 만드는 중…</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100">
      {children}
    </span>
  );
}

// Shown only when the catalog itself is empty — filter fallback handles the
// "no filter matches" case by widening to all contents.
function EmptyState() {
  return (
    <div className="text-center py-20">
      <div className="text-5xl mb-3">🛠️</div>
      <p className="text-gray-700 font-medium">콘텐츠를 준비 중이에요</p>
      <p className="mt-1 text-sm text-gray-400">
        조금만 기다려주세요. 곧 새 콘텐츠가 추가돼요.
      </p>
    </div>
  );
}
