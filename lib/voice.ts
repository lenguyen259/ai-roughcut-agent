import type { CaptionCue, EditResult, PlayDomain } from "./types";

export class TimelineVoice {
  private generation = 0;
  private activeKey: string | null = null;

  stop(): void {
    this.generation += 1;
    this.activeKey = null;
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  }

  retarget(): void {
    this.generation += 1;
    this.activeKey = null;
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  }

  unlock(): void {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(" ");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  }

  follow(edit: EditResult, domain: PlayDomain, time: number, playing: boolean, enabled: boolean, immediate = false): void {
    if (!enabled || !playing || typeof window === "undefined" || !window.speechSynthesis) {
      if (!playing || !enabled) this.stop();
      return;
    }
    if (domain === "source" && edit.lifted.some((span) => time >= span.start && time < span.end)) return;
    const cue = cueAt(edit, domain, time);
    if (!cue) return;
    const key = `${domain}:${cue.programIn.toFixed(3)}:${cue.sourceIn.toFixed(3)}`;
    if (key === this.activeKey) return;
    const words = cue.words.filter((word) => {
      const end = domain === "program" ? word.programOut : word.sourceOut;
      return end > time + 0.03;
    });
    if (words.length === 0) return;
    this.activeKey = key;
    const start = domain === "program" ? words[0].programIn : words[0].sourceIn;
    const end = domain === "program" ? words[words.length - 1].programOut : words[words.length - 1].sourceOut;
    const span = Math.max(0.35, end - Math.max(time, start));
    const rate = clamp((words.length * 0.42) / span, 0.9, 1.45);
    this.speak(words.map((word) => word.text).join(" "), rate, immediate);
  }

  private speak(text: string, rate: number, immediate: boolean): void {
    const generation = ++this.generation;
    window.speechSynthesis.cancel();
    const start = () => {
      if (generation !== this.generation) return;
      const utterance = new SpeechSynthesisUtterance(text.replace(/\s+/g, " ").trim());
      utterance.rate = rate;
      utterance.pitch = 1;
      utterance.lang = "en-US";
      const voice = pickVoice();
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
    };
    if (immediate) start();
    else window.setTimeout(start, 40);
  }
}

function cueAt(edit: EditResult, domain: PlayDomain, time: number): CaptionCue | null {
  return (
    edit.captions.find((cue) => {
      const start = domain === "program" ? cue.programIn : cue.sourceIn;
      const end = domain === "program" ? cue.programOut : cue.sourceOut;
      return time >= start && time < end;
    }) ?? null
  );
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => /en-US/i.test(voice.lang) && /natural|google|aria|jenny|samantha/i.test(voice.name)) ??
    voices.find((voice) => /en-US/i.test(voice.lang)) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    null
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
