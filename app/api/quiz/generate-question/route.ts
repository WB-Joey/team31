// POST /api/quiz/generate-question
//
// Generates one bible-quiz question via the Google Gemini API. Same external
// contract as the previous Anthropic version — QuizGameView and the
// generateQuestion client helper are unchanged.
//
// Inputs (JSON body):
//   referenceText?: string
//   priorQuestions?: string[]
//   forceNonsense?: boolean
//
// Output (JSON):
//   On success: { question: QuizQuestion }
//   On error:   { error: string }
//
// Notes:
//   - Uses gemini-2.5-flash-lite for free-tier eligibility (15 RPM, 1000/day).
//   - Asks the model to return raw JSON; we parse and validate before
//     returning. We use responseMimeType=application/json to encourage strict
//     output, which is honored on Gemini 2.5 family models.

import type { QuizQuestion, QuizQuestionType } from "@/lib/types";

export const runtime = "edge";

const MODEL = "gemini-2.5-flash-lite";

interface RequestBody {
  referenceText?: string;
  priorQuestions?: string[];
  forceNonsense?: boolean;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildSystemInstruction(): string {
  return [
    "당신은 한국 교회 청년부 모임에서 진행하는 '성경 퀴즈 대회'의 문제 출제자입니다.",
    "한 번에 한 문제만 만들어 JSON 형식으로 반환합니다.",
    "",
    "JSON 스키마(반드시 이 키와 형식을 정확히 따릅니다):",
    "{",
    '  "type": "subjective" | "multiple_choice" | "ox" | "nonsense",',
    '  "text": "문제 본문 (한국어)",',
    '  "answers": ["정답1", "정답2", ...],',
    '  "choices": ["보기1", "보기2", "보기3", "보기4"] | null',
    "}",
    "",
    "주의사항:",
    "- 반드시 JSON만 반환하세요. 설명이나 코드 블록 없이.",
    "- subjective(주관식)은 단답형이어야 합니다. 답이 길거나 서술식이면 안 됩니다.",
    "- subjective의 answers에는 동의어/표기 변형을 모두 포함하세요. 예: ['사랑', '사랑함']",
    "- multiple_choice는 정확히 4개의 보기와 명확히 하나의 정답을 가지며, answers에는 정답 보기의 텍스트와 번호 둘 다 포함하세요. 예: answers=['유다', '3'], choices=['베드로','요한','유다','안드레']",
    "- ox는 answers를 ['O'] 또는 ['X']로 설정합니다.",
    "- nonsense(넌센스)는 성경 인물/사건을 활용한 가벼운 말장난 또는 재치 문답입니다. 어렵지 않고 즐거운 분위기를 위한 것입니다.",
    "- 모든 문제는 정확하고 검증 가능한 성경 지식에 기반해야 합니다. 추측하지 마세요.",
    "- 청년부 모임에 적절한 톤(친근하고 따뜻하지만 너무 가볍지는 않게)을 사용하세요.",
  ].join("\n");
}

function buildUserPrompt(body: RequestBody): string {
  const lines: string[] = [];
  let type: QuizQuestionType;
  if (body.forceNonsense) {
    type = "nonsense";
  } else {
    const r = Math.random();
    if (r < 0.6) type = "subjective";
    else if (r < 0.85) type = "multiple_choice";
    else type = "ox";
  }
  lines.push(`이번 문제 타입은 반드시 "${type}"입니다.`);

  const ref = (body.referenceText ?? "").trim();
  if (ref.length > 0) {
    lines.push("");
    lines.push("아래 참고자료의 내용 안에서 문제를 만들어 주세요:");
    lines.push("---");
    lines.push(ref);
    lines.push("---");
  } else {
    const focusAreas = [
      "구약 인물(아브라함, 모세, 다윗 등)",
      "신약 인물(예수님의 제자, 사도 바울 등)",
      "예수님의 비유",
      "예수님의 기적",
      "주요 사건(출애굽, 십자가, 부활 등)",
      "성경 책 이름과 순서",
      "주요 가르침과 교훈",
    ];
    lines.push("");
    lines.push(`성경 전체 범위에서 출제합니다. 이번에는 "${pick(focusAreas)}" 쪽에 초점을 맞춰주세요.`);
  }

  const priors = body.priorQuestions ?? [];
  if (priors.length > 0) {
    lines.push("");
    lines.push("이미 출제된 문제들과 겹치지 않게 해주세요:");
    for (const q of priors.slice(-10)) {
      lines.push(`- ${q}`);
    }
  }

  lines.push("");
  lines.push("이제 JSON 한 개를 출력하세요.");
  return lines.join("\n");
}

function validateQuestion(raw: unknown): QuizQuestion | string {
  if (!raw || typeof raw !== "object") return "응답이 객체가 아닙니다.";
  const obj = raw as Record<string, unknown>;

  const type = obj.type;
  if (
    type !== "subjective" &&
    type !== "multiple_choice" &&
    type !== "ox" &&
    type !== "nonsense"
  ) {
    return `잘못된 type: ${String(type)}`;
  }

  const text = typeof obj.text === "string" ? obj.text.trim() : "";
  if (!text) return "text가 비어있습니다.";

  const answersRaw = obj.answers;
  if (!Array.isArray(answersRaw) || answersRaw.length === 0) {
    return "answers가 비어있습니다.";
  }
  const answers = answersRaw
    .map((a) => (typeof a === "string" ? a.trim() : ""))
    .filter((s) => s.length > 0);
  if (answers.length === 0) return "answers에 유효한 문자열이 없습니다.";

  let choices: string[] | null = null;
  if (type === "multiple_choice") {
    const choicesRaw = obj.choices;
    if (!Array.isArray(choicesRaw) || choicesRaw.length !== 4) {
      return "multiple_choice는 choices 4개가 필요합니다.";
    }
    choices = choicesRaw.map((c) => (typeof c === "string" ? c.trim() : ""));
    if (choices.some((c) => !c)) return "choices에 빈 보기가 있습니다.";
  }
  if (type === "ox") {
    const a = answers[0].toUpperCase();
    if (a !== "O" && a !== "X") return "ox 정답은 O 또는 X여야 합니다.";
    answers[0] = a;
  }

  return {
    id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    text,
    answers,
    choices,
    source: "manual",
  };
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const apiResponse = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: buildSystemInstruction() }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildUserPrompt(body) }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 1.0,
        maxOutputTokens: 800,
      },
    }),
  });

  if (!apiResponse.ok) {
    const errText = await apiResponse.text().catch(() => "");
    return Response.json(
      { error: `Gemini API 호출 실패 (${apiResponse.status}): ${errText.slice(0, 300)}` },
      { status: 502 },
    );
  }

  const data = (await apiResponse.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    return Response.json(
      { error: `Gemini가 요청을 차단함: ${data.promptFeedback.blockReason}` },
      { status: 502 },
    );
  }

  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) {
    return Response.json(
      { error: "Gemini 응답에 텍스트가 없습니다." },
      { status: 502 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return Response.json(
        { error: "응답에서 JSON을 찾지 못했습니다.", raw: text.slice(0, 300) },
        { status: 502 },
      );
    }
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      return Response.json(
        { error: `JSON 파싱 실패: ${(e as Error).message}` },
        { status: 502 },
      );
    }
  }

  const validated = validateQuestion(parsed);
  if (typeof validated === "string") {
    return Response.json(
      { error: `검증 실패: ${validated}` },
      { status: 502 },
    );
  }

  const source = (body.referenceText ?? "").trim().length > 0
    ? "reference"
    : "bible_general";

  return Response.json({
    question: { ...validated, source },
  });
}
