import type { EditResult } from "./types";
import { formatTimecode } from "./time";

export function toEdl(edit: EditResult): string {
  const lines = ["TITLE: ROUGHCUT-AGENT", "FCM: NON-DROP FRAME", ""];
  edit.keeps.forEach((keep, index) => {
    const number = String(index + 1).padStart(3, "0");
    lines.push(
      `${number}  AX       V     C        ${formatTimecode(keep.sourceIn)} ${formatTimecode(keep.sourceOut)} ${formatTimecode(keep.programIn)} ${formatTimecode(keep.programOut)}`,
    );
    lines.push("* FROM CLIP NAME: SUNDAY-DEMO");
  });
  return `${lines.join("\n")}\n`;
}

export function toDecisionJson(edit: EditResult): string {
  return JSON.stringify(
    {
      sourceDuration: edit.sourceDuration,
      programDuration: edit.programDuration,
      removedRatio: edit.stats.removedRatio,
      loudness: edit.loudness,
      keeps: edit.keeps,
      broll: edit.broll,
      captions: edit.captions.map((cue) => ({
        text: cue.words.map((word) => word.text).join(" "),
        programIn: cue.programIn,
        programOut: cue.programOut,
      })),
      logs: edit.logs,
    },
    null,
    2,
  );
}
