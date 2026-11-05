import { scoreText } from "./embed";
import { peaksFromWords } from "./audio";
import { normalizeToken } from "./text";
import { clamp } from "./time";
import type {
  AgentOptions,
  AnnotatedWord,
  BrollHit,
  CaptionCue,
  CaptionWord,
  Clip,
  EditResult,
  Interval,
  KeepSegment,
  MediaInfo,
  Word,
} from "./types";

const CONSERVATIVE = new Set(["um", "uh", "er", "ah", "hmm", "uhhuh", "ờ", "ừ", "ờm", "à"]);
const PHRASES = ["you know", "i mean", "kind of", "sort of"];
const HESITATIONS = new Set(["like", "basically", "actually", "literally"]);
const TARGET_DB = -16;

type Sentence = {
  words: AnnotatedWord[];
  text: string;
};

export function runAgent(words: Word[], clips: Clip[], options: AgentOptions, media: MediaInfo = {}): EditResult {
  const annotated = markFillers(words, options.aggressiveFillers);
  const sourceDuration = Math.max(media.sourceDuration ?? 0, lastEnd(annotated) + 0.2, 0.2);
  const silences = silenceIntervals(annotated, sourceDuration, options.silenceThreshold);
  const fillerSpans = fillerIntervals(annotated);
  const keeps = toProgram(subtractInterval({ start: 0, end: sourceDuration }, [...silences, ...fillerSpans]));
  const programDuration = keeps.length > 0 ? keeps[keeps.length - 1].programOut : 0;
  const lifted = complement(sourceDuration, keeps);
  const sentences = sentencesFrom(annotated);
  const placed = placeBroll(sentences, clips, keeps, options);
  const captions = buildCaptions(annotated, keeps);
  const loudness = measureLoudness(media.rmsDb ?? null);
  const peaks = media.peaks ?? peaksFromWords(words, sourceDuration);
  const stats = {
    fillerCount: annotated.filter((word) => word.filler).length,
    silenceCount: silences.length,
    removedRatio: sourceDuration > 0 ? 1 - programDuration / sourceDuration : 0,
    skippedSentences: placed.skipped,
  };

  return {
    words: annotated,
    keeps,
    lifted,
    broll: placed.hits,
    captions,
    sourceDuration,
    programDuration,
    peaks,
    logs: buildLogs(annotated, silences, keeps, placed.hits, captions, loudness, stats, options, sourceDuration, programDuration),
    loudness,
    stats,
  };
}

export function programToSource(keeps: KeepSegment[], time: number): number {
  if (keeps.length === 0) return 0;
  for (const keep of keeps) {
    if (time <= keep.programOut) {
      const local = Math.max(0, time - keep.programIn);
      return clamp(keep.sourceIn + local, keep.sourceIn, keep.sourceOut);
    }
  }
  return keeps[keeps.length - 1].sourceOut;
}

export function sourceToProgram(keeps: KeepSegment[], time: number): number | null {
  for (const keep of keeps) {
    if (time >= keep.sourceIn - 0.001 && time <= keep.sourceOut + 0.001) {
      return keep.programIn + (time - keep.sourceIn);
    }
  }
  for (const keep of keeps) {
    if (keep.sourceIn >= time) return keep.programIn;
  }
  return keeps.length > 0 ? keeps[keeps.length - 1].programOut : null;
}

export function activeWordId(edit: EditResult, domainTime: number, domain: "program" | "source"): string | null {
  const source = domain === "source" ? domainTime : programToSource(edit.keeps, domainTime);
  const word = edit.words.find((item) => !item.filler && source >= item.start && source <= item.end);
  return word?.id ?? null;
}

function markFillers(words: Word[], aggressive: boolean): AnnotatedWord[] {
  const flags = words.map((word) => CONSERVATIVE.has(normalizeToken(word.text)));
  if (aggressive) {
    for (const phrase of PHRASES) {
      const parts = phrase.split(" ");
      for (let index = 0; index <= words.length - parts.length; index += 1) {
        const matched = parts.every((part, offset) => normalizeToken(words[index + offset].text) === part);
        if (!matched) continue;
        for (let offset = 0; offset < parts.length; offset += 1) flags[index + offset] = true;
      }
    }
    words.forEach((word, index) => {
      if (!HESITATIONS.has(normalizeToken(word.text))) return;
      const previous = words[index - 1];
      const gap = previous ? word.start - previous.end : 1;
      if (!previous || gap > 0.2 || flags[index - 1]) flags[index] = true;
    });
  }
  return words.map((word, index) => ({ ...word, filler: flags[index] }));
}

function silenceIntervals(words: AnnotatedWord[], duration: number, threshold: number): Interval[] {
  const spans: Interval[] = [];
  if (words.length === 0) return duration > threshold ? [{ start: 0, end: duration }] : [];
  if (words[0].start >= threshold) spans.push({ start: 0, end: words[0].start });
  for (let index = 0; index < words.length - 1; index += 1) {
    const gapStart = words[index].end;
    const gapEnd = words[index + 1].start;
    if (gapEnd - gapStart >= threshold) spans.push({ start: gapStart, end: gapEnd });
  }
  const tail = duration - words[words.length - 1].end;
  if (tail >= threshold) spans.push({ start: words[words.length - 1].end, end: duration });
  return spans;
}

function fillerIntervals(words: AnnotatedWord[]): Interval[] {
  const spans: Interval[] = [];
  words.forEach((word, index) => {
    if (!word.filler) return;
    let start = word.start;
    let end = word.end;
    const previous = words[index - 1];
    const next = words[index + 1];
    if (previous && !previous.filler && word.start - previous.end < 0.25) start = previous.end;
    if (next && !next.filler && next.start - word.end < 0.25) end = next.start;
    spans.push({ start, end });
  });
  return mergeIntervals(spans);
}

function subtractInterval(base: Interval, cuts: Interval[]): Interval[] {
  let parts = [base];
  for (const cut of cuts) {
    const next: Interval[] = [];
    for (const part of parts) {
      if (cut.end <= part.start || cut.start >= part.end) {
        next.push(part);
        continue;
      }
      if (cut.start > part.start) next.push({ start: part.start, end: Math.min(cut.start, part.end) });
      if (cut.end < part.end) next.push({ start: Math.max(cut.end, part.start), end: part.end });
    }
    parts = next;
  }
  return parts.filter((part) => part.end - part.start > 0.045);
}

function toProgram(parts: Interval[]): KeepSegment[] {
  let cursor = 0;
  return parts.map((part) => {
    const segment = {
      sourceIn: part.start,
      sourceOut: part.end,
      programIn: cursor,
      programOut: cursor + (part.end - part.start),
    };
    cursor = segment.programOut;
    return segment;
  });
}

function complement(duration: number, keeps: KeepSegment[]): Interval[] {
  const lifted: Interval[] = [];
  let cursor = 0;
  for (const keep of keeps) {
    if (keep.sourceIn > cursor + 0.02) lifted.push({ start: cursor, end: keep.sourceIn });
    cursor = keep.sourceOut;
  }
  if (duration > cursor + 0.02) lifted.push({ start: cursor, end: duration });
  return lifted;
}

function sentencesFrom(words: AnnotatedWord[]): Sentence[] {
  const sentences: Sentence[] = [];
  let bucket: AnnotatedWord[] = [];
  const flush = () => {
    if (bucket.length === 0) return;
    sentences.push({ words: bucket, text: bucket.map((word) => word.text).join(" ") });
    bucket = [];
  };
  for (const word of words) {
    if (word.filler) continue;
    bucket.push(word);
    if (/[.!?]$/.test(word.text)) flush();
  }
  flush();
  return sentences;
}

function placeBroll(
  sentences: Sentence[],
  clips: Clip[],
  keeps: KeepSegment[],
  options: AgentOptions,
): { hits: BrollHit[]; skipped: number } {
  const indexed = clips.map((clip) => ({
    clip,
    document: `${clip.title} ${clip.description}`,
  }));
  const hits: BrollHit[] = [];
  let skipped = 0;
  let cursor = -1;
  for (const sentence of sentences) {
    const first = sentence.words[0];
    const last = sentence.words[sentence.words.length - 1];
    const programIn = sourceToProgram(keeps, first.start);
    const programOut = sourceToProgram(keeps, last.end);
    if (programIn === null || programOut === null) {
      skipped += 1;
      continue;
    }
    const available = programOut - programIn;
    if (available < 1.05 || programIn < cursor + 0.55) {
      skipped += 1;
      continue;
    }
    const previous = hits[hits.length - 1];
    const ranked = indexed
      .map((item) => {
        const score = scoreText(sentence.text, item.document);
        const penalty = previous && item.clip.id === previous.clipId ? 0.06 : 0;
        return { item, score, penalized: score - penalty };
      })
      .sort((left, right) => right.penalized - left.penalized);
    const best = ranked[0];
    const runner = ranked[1];
    if (!best || best.penalized < options.brollThreshold) {
      skipped += 1;
      continue;
    }
    const duration = Math.min(options.brollSeconds, available);
    hits.push({
      clipId: best.item.clip.id,
      title: best.item.clip.title,
      score: best.score,
      runnerUp: runner?.item.clip.title ?? "none",
      runnerUpScore: runner?.score ?? 0,
      sentence: sentence.text,
      sourceIn: first.start,
      sourceOut: last.end,
      programIn,
      programOut: programIn + duration,
    });
    cursor = programIn + duration;
  }
  return { hits, skipped };
}

function buildCaptions(words: AnnotatedWord[], keeps: KeepSegment[]): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let bucket: CaptionWord[] = [];
  const flush = () => {
    if (bucket.length === 0) return;
    cues.push({
      words: bucket,
      sourceIn: bucket[0].sourceIn,
      sourceOut: bucket[bucket.length - 1].sourceOut,
      programIn: bucket[0].programIn,
      programOut: bucket[bucket.length - 1].programOut,
    });
    bucket = [];
  };
  for (const word of words) {
    if (word.filler) continue;
    const programIn = sourceToProgram(keeps, word.start);
    const programOut = sourceToProgram(keeps, word.end);
    if (programIn === null || programOut === null) continue;
    const captionWord = {
      text: word.text,
      sourceIn: word.start,
      sourceOut: word.end,
      programIn,
      programOut,
    };
    const tooLong = bucket.length >= 5 || (bucket.length > 0 && captionWord.programOut - bucket[0].programIn > 2.15);
    const previousEnded = bucket.length > 0 && /[.!?]$/.test(bucket[bucket.length - 1].text);
    if (tooLong || previousEnded) flush();
    bucket.push(captionWord);
  }
  flush();
  return cues;
}

function measureLoudness(rmsDb: number | null): EditResult["loudness"] {
  if (rmsDb === null) return { rmsDb: null, gainDb: 0, linear: 1 };
  const gainDb = clamp(TARGET_DB - rmsDb, -12, 12);
  return { rmsDb, gainDb, linear: 10 ** (gainDb / 20) };
}

function buildLogs(
  words: AnnotatedWord[],
  silences: Interval[],
  keeps: KeepSegment[],
  hits: BrollHit[],
  captions: CaptionCue[],
  loudness: EditResult["loudness"],
  stats: EditResult["stats"],
  options: AgentOptions,
  sourceDuration: number,
  programDuration: number,
): string[] {
  const fillerList = words.filter((word) => word.filler).map((word) => word.text).join(", ");
  const silenceTotal = silences.reduce((total, span) => total + (span.end - span.start), 0);
  const logs = [
    `Transcript loaded: ${words.length} tokens across ${sourceDuration.toFixed(2)}s.`,
    `Fillers lifted: ${stats.fillerCount}${fillerList ? ` (${fillerList})` : ""}.`,
    `Silence above ${options.silenceThreshold.toFixed(2)}s: ${silences.length} gaps, ${silenceTotal.toFixed(2)}s.`,
    `Program time ${programDuration.toFixed(2)}s after ${keeps.length} keep segments. Removed ${(stats.removedRatio * 100).toFixed(0)}%.`,
  ];
  if (hits.length === 0) {
    logs.push("No B-roll cleared the similarity gate. Lower the threshold or add visual keywords to the script.");
  }
  for (const hit of hits) {
    logs.push(
      `B-roll ${hit.title} at ${hit.programIn.toFixed(2)}s, score ${hit.score.toFixed(2)} over ${hit.runnerUp} ${hit.runnerUpScore.toFixed(2)}.`,
    );
  }
  if (stats.skippedSentences > 0) logs.push(`Skipped ${stats.skippedSentences} sentences for spacing, length, or score.`);
  logs.push(`Kinetic captions: ${captions.length} cues.`);
  logs.push(
    loudness.rmsDb === null
      ? "Loudness: no audio file yet, preview stays at unity gain. Target is -16 dBFS once audio is decoded."
      : `Loudness: RMS ${loudness.rmsDb.toFixed(1)} dBFS, apply ${loudness.gainDb.toFixed(1)} dB toward -16 dBFS.`,
  );
  logs.push("Reframe: subject stays centered so the 9:16 gate crops the same action.");
  return logs;
}

function mergeIntervals(spans: Interval[]): Interval[] {
  const ordered = [...spans].sort((left, right) => left.start - right.start);
  const merged: Interval[] = [];
  for (const span of ordered) {
    const previous = merged[merged.length - 1];
    if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

function lastEnd(words: Word[]): number {
  return words.reduce((max, word) => Math.max(max, word.end), 0);
}
