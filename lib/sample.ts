import type { Clip, Word } from "./types";
import { wordDuration } from "./text";

const LINES: Array<{ text: string; gapAfter: number }> = [
  { text: "Shipping a YouTube video should not take your whole Sunday.", gapAfter: 0.92 },
  { text: "um", gapAfter: 0.26 },
  { text: "I used to lose hours just cutting breaths and dead air out of the timeline.", gapAfter: 0.2 },
  { text: "uh", gapAfter: 0.24 },
  { text: "The fix is an on-device agent that reads the transcript and drops the fillers.", gapAfter: 0.16 },
  { text: "you know", gapAfter: 0.88 },
  { text: "When I mention the morning coffee it should cut to the pour.", gapAfter: 0.3 },
  { text: "like", gapAfter: 0.22 },
  { text: "When I talk about retention charts, show the graph and the audience growth.", gapAfter: 0.9 },
  { text: "basically", gapAfter: 0.2 },
  { text: "Then we reframe the same cut for shorts on a phone without a second timeline.", gapAfter: 0.18 },
  { text: "um", gapAfter: 0.22 },
  { text: "That is the whole studio running in the browser.", gapAfter: 0.45 },
];

export const CLIPS: Clip[] = [
  {
    id: "coffee",
    title: "Morning pour",
    description: "morning coffee pour cup steam kitchen brew routine",
  },
  {
    id: "timeline",
    title: "Timeline pass",
    description: "timeline edit cutting breaths dead air assembly footage hours",
  },
  {
    id: "chart",
    title: "Retention chart",
    description: "retention charts graph analytics audience growth views",
  },
  {
    id: "phone",
    title: "Vertical phone",
    description: "shorts phone vertical reframe mobile social second timeline",
  },
  {
    id: "city",
    title: "Night upload",
    description: "youtube sunday shipping video creator city night upload",
  },
  {
    id: "mic",
    title: "Voice booth",
    description: "voice transcript audio speaking microphone filler words agent",
  },
];

export function buildSample(): { words: Word[]; sourceDuration: number } {
  const words: Word[] = [];
  let cursor = 0.4;
  let index = 0;
  for (const line of LINES) {
    const tokens = line.text.split(/\s+/).filter(Boolean);
    tokens.forEach((token, tokenIndex) => {
      const duration = wordDuration(token);
      const start = cursor;
      const end = cursor + duration;
      words.push({ id: `w${index}`, text: token, start, end });
      index += 1;
      const trailing = tokenIndex === tokens.length - 1 ? line.gapAfter : 0.07;
      cursor = end + trailing;
    });
  }
  return { words, sourceDuration: cursor + 0.25 };
}
