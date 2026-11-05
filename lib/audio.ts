import type { Interval, Word } from "./types";
import { wordDuration } from "./text";

export type ChannelAnalysis = {
  duration: number;
  peaks: number[];
  speech: Interval[];
  rmsDb: number;
};

export function analyzeChannel(channel: Float32Array, sampleRate: number, buckets = 180): ChannelAnalysis {
  const frame = Math.max(1, Math.floor(sampleRate * 0.02));
  const frameCount = Math.floor(channel.length / frame);
  const levels: number[] = [];
  for (let index = 0; index < frameCount; index += 1) {
    let sum = 0;
    const start = index * frame;
    for (let sample = start; sample < start + frame; sample += 1) {
      const value = channel[sample];
      sum += value * value;
    }
    const rms = Math.sqrt(sum / frame);
    levels.push(20 * Math.log10(rms + 1e-8));
  }

  const sorted = [...levels].sort((left, right) => left - right);
  const floor = sorted[Math.floor(sorted.length * 0.15)] ?? -50;
  const gate = Math.min(-26, Math.max(-48, floor + 12));
  const frameDuration = frame / sampleRate;
  const speech = mergeSpeech(levels, frameDuration, gate);
  const peaks = peaksFromChannel(channel, buckets);
  const rmsDb = voicedRms(channel, sampleRate, speech);

  return {
    duration: channel.length / sampleRate,
    peaks,
    speech,
    rmsDb,
  };
}

export function wordsFromSpeech(speech: Interval[]): Word[] {
  return speech.map((span, index) => ({
    id: `speech-${index}`,
    text: "[speech]",
    start: span.start,
    end: span.end,
  }));
}

export function alignTranscript(transcript: string, speech: Interval[]): Word[] {
  const tokens = transcript.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || speech.length === 0) return [];
  const speechDuration = speech.reduce((total, span) => total + (span.end - span.start), 0);
  const weights = tokens.map((token) => Math.max(0.2, wordDuration(token)));
  const weightTotal = weights.reduce((total, weight) => total + weight, 0);
  let flat = 0;
  return tokens.map((token, index) => {
    const slice = speechDuration * (weights[index] / weightTotal);
    const start = flatToAbsolute(flat, speech);
    const endFlat = flat + slice;
    const rawEnd = flatToAbsolute(endFlat, speech);
    const span = spanContaining(start, speech);
    const end = span && rawEnd > span.end + 0.001 ? span.end : Math.max(start + 0.08, rawEnd);
    flat = absoluteToFlat(end, speech);
    if (span && end >= span.end - 0.001) {
      const next = speech[speech.indexOf(span) + 1];
      if (next) flat = absoluteToFlat(next.start, speech);
    }
    return { id: `u${index}`, text: token, start, end: Math.max(start + 0.08, end) };
  });
}

export function peaksFromChannel(channel: Float32Array, buckets: number): number[] {
  const size = Math.max(1, Math.floor(channel.length / buckets));
  const peaks: number[] = [];
  for (let index = 0; index < buckets; index += 1) {
    const start = index * size;
    let max = 0;
    const end = Math.min(channel.length, start + size);
    for (let sample = start; sample < end; sample += 1) max = Math.max(max, Math.abs(channel[sample]));
    peaks.push(max);
  }
  return peaks;
}

export function peaksFromWords(words: Word[], duration: number, buckets = 180): number[] {
  const peaks = new Array<number>(buckets).fill(0.06);
  if (duration <= 0) return peaks;
  for (const word of words) {
    if (word.text === "[speech]") continue;
    const from = Math.max(0, Math.floor((word.start / duration) * buckets));
    const to = Math.min(buckets, Math.max(from + 1, Math.ceil((word.end / duration) * buckets)));
    for (let index = from; index < to; index += 1) {
      peaks[index] = Math.max(peaks[index], 0.42 + ((index * 13) % 8) / 20);
    }
  }
  return peaks;
}

function mergeSpeech(levels: number[], frameDuration: number, gate: number): Interval[] {
  const spans: Interval[] = [];
  let open: number | null = null;
  for (let index = 0; index < levels.length; index += 1) {
    const time = index * frameDuration;
    if (levels[index] >= gate) {
      if (open === null) open = time;
    } else if (open !== null) {
      spans.push({ start: open, end: time });
      open = null;
    }
  }
  if (open !== null) spans.push({ start: open, end: levels.length * frameDuration });

  const merged: Interval[] = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (previous && span.start - previous.end < 0.18) previous.end = span.end;
    else merged.push({ start: span.start, end: span.end });
  }
  return merged.filter((span) => span.end - span.start >= 0.12);
}

function voicedRms(channel: Float32Array, sampleRate: number, speech: Interval[]): number {
  let sum = 0;
  let count = 0;
  for (const span of speech) {
    const start = Math.max(0, Math.floor(span.start * sampleRate));
    const end = Math.min(channel.length, Math.floor(span.end * sampleRate));
    for (let index = start; index < end; index += 1) {
      sum += channel[index] * channel[index];
      count += 1;
    }
  }
  if (count === 0) return -60;
  return 20 * Math.log10(Math.sqrt(sum / count) + 1e-8);
}

function flatToAbsolute(flat: number, speech: Interval[]): number {
  let cursor = 0;
  for (const span of speech) {
    const length = span.end - span.start;
    if (flat <= cursor + length) return span.start + (flat - cursor);
    cursor += length;
  }
  return speech[speech.length - 1]?.end ?? 0;
}

function absoluteToFlat(time: number, speech: Interval[]): number {
  let cursor = 0;
  for (const span of speech) {
    if (time <= span.end) return cursor + Math.max(0, time - span.start);
    cursor += span.end - span.start;
  }
  return cursor;
}

function spanContaining(time: number, speech: Interval[]): Interval | null {
  return speech.find((span) => time >= span.start - 0.001 && time <= span.end + 0.001) ?? null;
}
