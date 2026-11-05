import { sourceToProgram } from "./agent";
import type { EditResult, PlayDomain } from "./types";

export type SpokenWord = {
  text: string;
  start: number;
  end: number;
};

type Span = {
  word: SpokenWord;
  from: number;
  to: number;
};

type VoiceKind = "female" | "male" | "any";

export class FrameVoice {
  private generation = 0;
  private spans: Span[] = [];
  private index = -1;
  private markedAt = 0;
  private running = false;
  onEnded: ((time: number) => void) | null = null;

  isRunning(): boolean {
    return this.running;
  }

  stop(): void {
    this.generation += 1;
    this.running = false;
    this.index = -1;
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  }

  sample(): number | null {
    if (!this.running || this.index < 0) return null;
    const word = this.spans[this.index]?.word;
    if (!word) return null;
    const elapsed = (performance.now() - this.markedAt) / 1000;
    const guess = Math.max(0.22, word.text.length * 0.064);
    const progress = Math.min(0.96, elapsed / guess);
    return word.start + (word.end - word.start) * progress;
  }

  start(words: SpokenWord[], from: number, kind: VoiceKind = "any"): void {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    const wasSpeaking = synth.speaking || synth.pending;
    this.generation += 1;
    const generation = this.generation;
    this.running = false;
    this.index = -1;
    synth.cancel();
    const upcoming = words.filter((word) => word.end > from + 0.02 && tokenOf(word.text).length > 0);
    this.spans = [];
    let cursor = 0;
    const parts: string[] = [];
    for (const word of upcoming) {
      const token = tokenOf(word.text);
      if (parts.length > 0) cursor += 1;
      const fromChar = cursor;
      parts.push(token);
      cursor += token.length;
      this.spans.push({ word, from: fromChar, to: cursor });
    }
    if (this.spans.length === 0) return;
    this.running = true;
    this.index = 0;
    this.markedAt = performance.now();
    const utterance = new SpeechSynthesisUtterance(parts.join(" "));
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.lang = "en-US";
    const voice = pickVoice(kind);
    if (voice) utterance.voice = voice;
    utterance.onboundary = (event) => {
      if (generation !== this.generation) return;
      if (event.name && event.name !== "word") return;
      const span = this.spans.find((item) => event.charIndex >= item.from && event.charIndex < item.to);
      if (!span) return;
      this.index = this.spans.indexOf(span);
      this.markedAt = performance.now();
    };
    utterance.onend = () => {
      if (generation !== this.generation || !this.running) return;
      const last = this.spans[this.spans.length - 1];
      this.running = false;
      this.index = -1;
      if (last) this.onEnded?.(last.word.end);
    };
    const speak = () => {
      if (generation !== this.generation) return;
      synth.speak(utterance);
    };
    if (wasSpeaking) window.setTimeout(speak, 40);
    else speak();
  }
}

export function spokenWords(edit: EditResult, domain: PlayDomain, from: number): SpokenWord[] {
  const words: SpokenWord[] = [];
  for (const word of edit.words) {
    if (word.filler) continue;
    const start = domain === "program" ? sourceToProgram(edit.keeps, word.start) : word.start;
    const end = domain === "program" ? sourceToProgram(edit.keeps, word.end) : word.end;
    if (start === null || end === null || end <= from + 0.02) continue;
    words.push({ text: word.text, start, end: Math.max(end, start + 0.05) });
  }
  return words;
}

function tokenOf(text: string): string {
  return text.replace(/[^\p{L}\p{N}'’-]+/gu, "");
}

function pickVoice(kind: VoiceKind): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const female = /female|samantha|victoria|zira|aria|jenny|sara|susan|karen|moira/i;
  const male = /male|david|mark|guy|daniel|alex|fred|rishi|george/i;
  if (kind === "female") return voices.find((voice) => female.test(voice.name)) ?? voices[0] ?? null;
  if (kind === "male") return voices.find((voice) => male.test(voice.name)) ?? voices[0] ?? null;
  return voices.find((voice) => /natural|google/i.test(voice.name)) ?? voices[0] ?? null;
}
