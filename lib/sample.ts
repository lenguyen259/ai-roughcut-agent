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

const ROOM: Array<{ text: string; gapAfter: number }> = [
  { text: "The guest sat down with a notebook and talked about the first winter in the harbor.", gapAfter: 0.16 },
  { text: "um", gapAfter: 0.22 },
  { text: "She described a quiet street, a teacher, and the suitcase she carried on the train.", gapAfter: 0.18 },
  { text: "Tell me what you kept from that year besides the notebook.", gapAfter: 0.2 },
  { text: "you know", gapAfter: 0.24 },
  { text: "I kept the habit of writing before breakfast and walking the long way to the station.", gapAfter: 0.16 },
  { text: "uh", gapAfter: 0.2 },
  { text: "The story turns when the letter arrives and she decides to stay through spring.", gapAfter: 0.18 },
  { text: "like", gapAfter: 0.22 },
  { text: "We leave a little air here so the rough cut can lift the pause.", gapAfter: 8 },
  { text: "After the pause she laughs and returns to the letter, the station, and the harbor light.", gapAfter: 0.16 },
  { text: "basically", gapAfter: 0.2 },
  { text: "That is the raw interview, still long, still full of breaths, waiting for a person to finish.", gapAfter: 0.18 },
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

const TARGET_SECONDS = 8 * 60;

export function buildSample(): { words: Word[]; sourceDuration: number } {
  const words: Word[] = [];
  let cursor = 0.4;
  let index = 0;
  const pushLine = (text: string, gapAfter: number) => {
    const tokens = text.split(/\s+/).filter(Boolean);
    tokens.forEach((token, tokenIndex) => {
      const duration = wordDuration(token);
      const start = cursor;
      const end = cursor + duration;
      words.push({ id: `w${index}`, text: token, start, end });
      index += 1;
      const trailing = tokenIndex === tokens.length - 1 ? gapAfter : 0.07;
      cursor = end + trailing;
    });
  };
  for (const line of LINES) pushLine(line.text, line.gapAfter);
  let pass = 0;
  while (cursor < TARGET_SECONDS && pass < 16) {
    for (const line of ROOM) pushLine(line.text, line.gapAfter);
    pass += 1;
  }
  return { words, sourceDuration: cursor + 0.25 };
}
