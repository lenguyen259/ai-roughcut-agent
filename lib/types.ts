export type Word = {
  id: string;
  text: string;
  start: number;
  end: number;
};

export type ClipId = "coffee" | "timeline" | "chart" | "phone" | "city" | "mic";

export type Clip = {
  id: ClipId;
  title: string;
  description: string;
};

export type Interval = {
  start: number;
  end: number;
};

export type KeepSegment = {
  sourceIn: number;
  sourceOut: number;
  programIn: number;
  programOut: number;
};

export type BrollHit = {
  clipId: ClipId;
  title: string;
  score: number;
  runnerUp: string;
  runnerUpScore: number;
  sentence: string;
  sourceIn: number;
  sourceOut: number;
  programIn: number;
  programOut: number;
};

export type CaptionWord = {
  text: string;
  sourceIn: number;
  sourceOut: number;
  programIn: number;
  programOut: number;
};

export type CaptionCue = {
  words: CaptionWord[];
  sourceIn: number;
  sourceOut: number;
  programIn: number;
  programOut: number;
};

export type AnnotatedWord = Word & {
  filler: boolean;
};

export type Loudness = {
  rmsDb: number | null;
  gainDb: number;
  linear: number;
};

export type EditStats = {
  fillerCount: number;
  silenceCount: number;
  removedRatio: number;
  skippedSentences: number;
};

export type EditResult = {
  words: AnnotatedWord[];
  keeps: KeepSegment[];
  lifted: Interval[];
  broll: BrollHit[];
  captions: CaptionCue[];
  sourceDuration: number;
  programDuration: number;
  peaks: number[];
  logs: string[];
  loudness: Loudness;
  stats: EditStats;
};

export type AgentOptions = {
  silenceThreshold: number;
  aggressiveFillers: boolean;
  brollThreshold: number;
  brollSeconds: number;
};

export type MediaInfo = {
  sourceDuration?: number;
  peaks?: number[];
  rmsDb?: number | null;
};

export type PlayDomain = "program" | "source";

export const DEFAULT_OPTIONS: AgentOptions = {
  silenceThreshold: 0.45,
  aggressiveFillers: true,
  brollThreshold: 0.22,
  brollSeconds: 2.4,
};
