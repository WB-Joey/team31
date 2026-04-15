import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md text-center">
        <div className="mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-100 text-brand-600 text-3xl mb-4">
            ✨
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            오늘의 팀모임,
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            우리 팀에 딱 맞는 콘텐츠는?
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href="/leader/filter"
            className="block w-full rounded-2xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold py-5 text-lg shadow-sm transition"
          >
            나는 리더예요
          </Link>
          <Link
            href="/member/join"
            className="block w-full rounded-2xl bg-white hover:bg-gray-50 active:bg-gray-100 text-brand-600 border-2 border-brand-200 font-semibold py-5 text-lg transition"
          >
            나는 팀원이에요
          </Link>
        </div>

        <p className="mt-10 text-xs text-gray-400">
          삼일교회 청년부 사근사근팀을 위한 콘텐츠 플랫폼
        </p>
      </div>
    </main>
  );
}
