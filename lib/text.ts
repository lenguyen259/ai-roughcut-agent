const STOP = new Set(
  "a an the of to and or for it is that this my we i you your on in at from be as by with without".split(" "),
);

export function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP.has(token));
}

export function wordDuration(token: string): number {
  const length = Math.max(1, normalizeToken(token).length);
  return clampDuration(0.12 + length * 0.028);
}

function clampDuration(value: number): number {
  return Math.min(0.58, Math.max(0.14, value));
}
