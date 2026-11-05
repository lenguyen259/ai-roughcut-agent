import { tokenize } from "./text";

const DIM = 64;

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function embed(text: string): Float32Array {
  const vector = new Float32Array(DIM);
  const tokens = tokenize(text);
  tokens.forEach((token, index) => {
    addFeature(vector, token, 1);
    if (index > 0) addFeature(vector, `${tokens[index - 1]}_${token}`, 1.15);
  });
  return normalize(vector);
}

export function overlap(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  return shared / Math.sqrt(leftTokens.size * rightTokens.size);
}

export function scoreText(query: string, document: string): number {
  const geometric = Math.max(0, cosine(embed(query), embed(document)));
  return 0.62 * overlap(query, document) + 0.38 * geometric;
}

export function cosine(left: Float32Array, right: Float32Array): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function addFeature(vector: Float32Array, token: string, weight: number): void {
  const hash = hashToken(token);
  const slot = hash % DIM;
  const sign = (hash & 1) === 0 ? 1 : -1;
  vector[slot] += sign * weight;
}

function normalize(vector: Float32Array): Float32Array {
  let norm = 0;
  for (const value of vector) norm += value * value;
  const scale = Math.sqrt(norm);
  if (scale === 0) return vector;
  for (let index = 0; index < vector.length; index += 1) vector[index] /= scale;
  return vector;
}
