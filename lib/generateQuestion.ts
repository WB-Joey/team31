// Client-side helper that calls our /api/quiz/generate-question route.
// Used by QuizGameView to pre-load the next question while the current one
// is on the floor.

import type { QuizQuestion } from "@/lib/types";

interface GenerateOptions {
  referenceText?: string;
  priorQuestions?: string[];
  forceNonsense?: boolean;
}

export async function generateQuestion(
  opts: GenerateOptions = {},
): Promise<QuizQuestion> {
  const res = await fetch("/api/quiz/generate-question", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opts),
  });

  // Read once; we may need the body for either the success or error path.
  const data = (await res.json().catch(() => null)) as
    | { question?: QuizQuestion; error?: string }
    | null;

  if (!res.ok || !data?.question) {
    const msg = data?.error ?? `문제 생성 실패 (${res.status})`;
    throw new Error(msg);
  }

  return data.question;
}
