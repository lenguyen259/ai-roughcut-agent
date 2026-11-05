"use client";

import type { MouseEvent } from "react";
import { programToSource } from "../lib/agent";
import type { EditResult, PlayDomain } from "../lib/types";
import { formatClock } from "../lib/time";

type TimelineProps = {
  edit: EditResult;
  domain: PlayDomain;
  time: number;
  onSeek: (time: number) => void;
};

export function Timeline({ edit, domain, time, onSeek }: TimelineProps) {
  const duration = Math.max(0.001, domain === "program" ? edit.programDuration : edit.sourceDuration);
  const peaks = domain === "program" ? programPeaks(edit) : edit.peaks;
  const peakMax = Math.max(0.001, ...peaks);

  function seek(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    onSeek(ratio * duration);
  }

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="time-readout">
        <span>{domain === "program" ? "Program" : "Source"}</span>
        <strong>{formatClock(time)}</strong>
        <span>/ {formatClock(duration)}</span>
      </div>
      <div className="lanes" onClick={seek} role="slider" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={time} aria-label="Seek" tabIndex={0}>
        <div className="playhead" style={{ left: `${(time / duration) * 100}%` }} />
        <div className="lane wave">
          {peaks.map((peak, index) => (
            <i key={index} style={{ height: `${Math.max(8, (peak / peakMax) * 100)}%` }} />
          ))}
          {domain === "source"
            ? edit.lifted.map((span) => (
                <em key={`${span.start}-${span.end}`} className="hatch" style={box(span.start, span.end, edit.sourceDuration)} />
              ))
            : null}
        </div>
        <div className="lane clips">
          {edit.broll.map((hit) => {
            const start = domain === "program" ? hit.programIn : hit.sourceIn;
            const end = domain === "program" ? hit.programOut : hit.sourceOut;
            return (
              <strong key={`${hit.clipId}-${hit.programIn}`} style={box(start, end, duration)}>
                {hit.title}
              </strong>
            );
          })}
        </div>
        <div className="lane subs">
          {edit.captions.map((cue) => {
            const start = domain === "program" ? cue.programIn : cue.sourceIn;
            const end = domain === "program" ? cue.programOut : cue.sourceOut;
            return <b key={`${cue.programIn}-${cue.sourceIn}`} style={box(start, end, duration)} />;
          })}
        </div>
      </div>
    </section>
  );
}

function programPeaks(edit: EditResult, buckets = 160): number[] {
  if (edit.programDuration <= 0 || edit.peaks.length === 0) return edit.peaks;
  return Array.from({ length: buckets }, (_, index) => {
    const source = programToSource(edit.keeps, (index / buckets) * edit.programDuration);
    const bucket = Math.floor((source / Math.max(edit.sourceDuration, 0.001)) * edit.peaks.length);
    return edit.peaks[Math.max(0, Math.min(edit.peaks.length - 1, bucket))] ?? 0;
  });
}

function box(start: number, end: number, duration: number): { left: string; width: string } {
  const safe = Math.max(duration, 0.001);
  return {
    left: `${(start / safe) * 100}%`,
    width: `${Math.max(0.4, ((end - start) / safe) * 100)}%`,
  };
}
