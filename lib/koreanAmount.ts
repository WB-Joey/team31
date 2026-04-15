// Format a won amount using Korean place-value notation.
//
// Examples:
//   5_000_000   → "5백만원"
//   12_000_000  → "1천 2백만원"
//   100_000_000 → "1억원"
//   15_000_000  → "1천 5백만원"
//   150_000_000 → "1억 5천만원"
//
// Splits into 억 / 만 / below-만 blocks; each block is expanded
// into 천·백·십·units and joined with spaces so long amounts stay
// legible ("1천 2백만원" rather than "1천2백만원").
export function formatKoreanAmount(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "0원";
  if (n < 0) return `-${formatKoreanAmount(-n)}`;

  const eok = Math.floor(n / 100_000_000);
  const remAfterEok = n - eok * 100_000_000;
  const man = Math.floor(remAfterEok / 10_000);
  const sub = remAfterEok - man * 10_000;

  const parts: string[] = [];
  if (eok > 0) parts.push(expandBlock(eok) + "억");
  if (man > 0) parts.push(expandBlock(man) + "만");
  if (sub > 0) parts.push(expandBlock(sub));

  return parts.join(" ") + "원";
}

// Expand a 1..9999 integer into e.g. "1천 2백 3십 4" (dropping zero digits).
function expandBlock(n: number): string {
  const cheon = Math.floor(n / 1000);
  const baek = Math.floor((n % 1000) / 100);
  const ship = Math.floor((n % 100) / 10);
  const ones = n % 10;
  const out: string[] = [];
  if (cheon > 0) out.push(`${cheon}천`);
  if (baek > 0) out.push(`${baek}백`);
  if (ship > 0) out.push(`${ship}십`);
  if (ones > 0) out.push(`${ones}`);
  return out.join(" ");
}
