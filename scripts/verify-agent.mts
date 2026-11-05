import assert from "node:assert/strict";
import { activeWordId, runAgent, sourceToProgram } from "../lib/agent.ts";
import { alignTranscript, wordsFromSpeech } from "../lib/audio.ts";
import { cosine, embed, scoreText } from "../lib/embed.ts";
import { toEdl } from "../lib/edl.ts";
import { CLIPS, buildSample } from "../lib/sample.ts";
import { DEFAULT_OPTIONS } from "../lib/types.ts";

const sample = buildSample();
const edit = runAgent(sample.words, CLIPS, DEFAULT_OPTIONS, { sourceDuration: sample.sourceDuration });

console.log(edit.logs.join("\n"));
console.log(
  "broll",
  edit.broll.map((hit) => `${hit.title}:${hit.score.toFixed(2)}`).join(" | "),
);

assert.ok(edit.programDuration < edit.sourceDuration, "program should be shorter than source");
assert.ok(edit.stats.removedRatio > 0.08, "expected a visible amount of lifted time");
assert.ok(edit.stats.fillerCount >= 6, `expected fillers, got ${edit.stats.fillerCount}`);
assert.ok(edit.stats.silenceCount >= 2, "expected silence gaps");
assert.ok(edit.broll.length >= 3, "expected several B-roll hits");
assert.ok(edit.captions.length >= 6, "expected caption cues");

for (const word of edit.words) {
  if (!word.filler) continue;
  const midpoint = (word.start + word.end) / 2;
  const kept = edit.keeps.some((keep) => midpoint >= keep.sourceIn && midpoint <= keep.sourceOut);
  assert.equal(kept, false, `${word.text} should be lifted`);
}

const titles = new Set(edit.broll.map((hit) => hit.clipId));
for (const id of ["coffee", "chart", "phone"] as const) {
  assert.ok(titles.has(id), `missing ${id}`);
}

assert.match(toEdl(edit), /TITLE: ROUGHCUT-AGENT/);
assert.equal(toEdl(edit).split("\n").filter((line) => line.startsWith("001") || /^\d{3}  AX/.test(line)).length, edit.keeps.length);

const same = cosine(embed("morning coffee pour"), embed("morning coffee pour"));
assert.ok(same > 0.99, `cosine ${same}`);

const coffeeQuery = "When I mention the morning coffee it should cut to the pour.";
const scores = CLIPS.map((clip) => ({
  id: clip.id,
  score: scoreText(coffeeQuery, `${clip.title} ${clip.description}`),
}));
scores.sort((left, right) => right.score - left.score);
assert.equal(scores[0]?.id, "coffee");

const aligned = alignTranscript("alpha beta gamma", [
  { start: 1, end: 2 },
  { start: 4, end: 5 },
]);
assert.equal(aligned.length, 3);
assert.ok(aligned[0].start < aligned[1].start);
assert.ok(aligned.every((word) => word.end > word.start));

const speechWords = wordsFromSpeech([
  { start: 0.2, end: 1.2 },
  { start: 2.4, end: 3.4 },
]);
const speechEdit = runAgent(speechWords, CLIPS, DEFAULT_OPTIONS, { sourceDuration: 3.8, rmsDb: -28 });
assert.ok(speechEdit.stats.silenceCount >= 1);
assert.ok(speechEdit.loudness.linear > 1);
const firstKept = edit.words.find((word) => !word.filler);
const firstProgram = firstKept ? sourceToProgram(edit.keeps, firstKept.start) : 0;
assert.equal(activeWordId(edit, firstProgram ?? 0, "program"), firstKept?.id ?? null);

console.log("verify-agent: ok");
