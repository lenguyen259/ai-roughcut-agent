import type { KeepSegment, PlayDomain } from "./types";

type PlayRequest = {
  buffer: AudioBuffer;
  domain: PlayDomain;
  keeps: KeepSegment[];
  from: number;
  duration: number;
  gain: number;
};

export class CutPlayer {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private streamDestination: MediaStreamAudioDestinationNode | null = null;
  private playing = false;
  private originContextTime = 0;
  private originMediaTime = 0;
  private duration = 0;

  isPlaying(): boolean {
    return this.playing;
  }

  getTime(): number {
    if (!this.context || !this.playing) return this.originMediaTime;
    const elapsed = this.originMediaTime + (this.context.currentTime - this.originContextTime);
    return Math.min(this.duration, Math.max(0, elapsed));
  }

  async play(request: PlayRequest): Promise<void> {
    this.halt();
    const context = this.ensure();
    await context.resume();
    if (!this.master) return;
    this.master.gain.value = request.gain;
    this.duration = request.duration;
    this.originMediaTime = request.from;
    this.originContextTime = context.currentTime + 0.04;
    if (request.domain === "source") {
      this.schedule(request.buffer, this.originContextTime, request.from, Math.max(0, request.duration - request.from));
    } else {
      for (const keep of request.keeps) {
        if (keep.programOut <= request.from) continue;
        const programStart = Math.max(keep.programIn, request.from);
        const offset = keep.sourceIn + (programStart - keep.programIn);
        const span = keep.programOut - programStart;
        if (span <= 0.02) continue;
        const when = this.originContextTime + (programStart - request.from);
        this.schedule(request.buffer, when, offset, span);
      }
    }
    this.playing = true;
  }

  pause(): number {
    const time = this.getTime();
    this.originMediaTime = time;
    this.playing = false;
    this.stopSources();
    return time;
  }

  halt(): void {
    this.playing = false;
    this.stopSources();
  }

  captureStream(): MediaStream | null {
    const context = this.ensure();
    if (!this.master) return null;
    if (!this.streamDestination) {
      this.streamDestination = context.createMediaStreamDestination();
      this.master.connect(this.streamDestination);
    }
    return this.streamDestination.stream;
  }

  private schedule(buffer: AudioBuffer, when: number, offset: number, duration: number): void {
    if (!this.context || !this.master || duration <= 0.02) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.master);
    const attack = Math.min(0.012, duration / 3);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(1, when + attack);
    gain.gain.setValueAtTime(1, when + Math.max(attack, duration - attack));
    gain.gain.linearRampToValueAtTime(0, when + duration);
    const safeOffset = Math.min(Math.max(0, offset), Math.max(0, buffer.duration - 0.01));
    const safeDuration = Math.min(duration, buffer.duration - safeOffset);
    if (safeDuration <= 0.02) return;
    source.start(when, safeOffset, safeDuration);
    this.sources.push(source);
  }

  private ensure(): AudioContext {
    if (!this.context) {
      const Context = window.AudioContext;
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
    }
    return this.context;
  }

  private stopSources(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // The source already ended.
      }
      source.disconnect();
    }
    this.sources = [];
  }
}
