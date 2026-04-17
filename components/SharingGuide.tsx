"use client";

const SHARING_EXAMPLES = [
  "낙찰(또는 유찰)받은 가치관이 무엇인가요?",
  "가장 높은 금액으로 입찰한 가치관은 무엇인가요?",
  "그 가치관에 가장 많이 투자한 이유가 있나요?",
  "예상보다 낮은 금액에 낙찰받은 가치관이 있나요?",
  "오늘 경매를 통해 새롭게 발견한 나의 가치관이 있나요?",
];

export default function SharingGuide() {
  return (
    <div
      id="sharing-guide"
      className="rounded-2xl bg-white border border-gray-200 p-5 space-y-4 scroll-mt-20"
    >
      <div>
        <p className="text-base font-semibold text-gray-900">💬 나눔 시간</p>
        <p className="mt-1 text-sm text-gray-600">
          자유롭게 나눔할 수 있습니다 😊
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">[나눔 예시]</p>
        <ol className="space-y-1.5">
          {SHARING_EXAMPLES.map((q, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="shrink-0 font-semibold text-brand-600 tabular-nums">
                {i + 1}.
              </span>
              <span>{q}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
