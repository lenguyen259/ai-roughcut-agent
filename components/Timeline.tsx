"use client";

import type { MouseEvent } from "react";
import { programToSource } from "../lib/agent";
import type { EditResult, PlayDomain } from "../lib/types";
import { formatTimecode } from "../lib/time";

type TimelineProps = {
  edit: EditResult;
  domain: PlayDomain;
  time: number;
  onSeek: (time: number) => void;
};

export function Timeline({ edit, domain, time, onSeek }: TimelineProps) {
  const duration = Math.max(0.001, domain === "program" ? edit.programDuration : edit.sourceDuration);
  const minutes = Math.floor(duration / 60);

  function seek(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    onSeek(ratio * duration);
  }

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="time-readout">
        <span>{domain === "program" ? "Rough cut" : "Rushes"}</span>
        <strong>{formatTimecode(time)}</strong>
        <span>/ {formatTimecode(duration)}</span>
      </div>
      <div className="ruler" aria-hidden="true">
        {Array.from({ length: minutes + 1 }, (_, minute) => (
          <i key={minute} style={{ left: `${(minute * 60 / duration) * 100}%` }}>
            {minute}m
          </i>
        ))}
      </div>
      <div className="bay">
        <div className="track-names">
          <span>V1 A-roll</span>
          <span>V2 B-roll</span>
          <span>CC</span>
        </div>
        <div className="lanes" onClick={seek} role="slider" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={time} aria-label="Seek the rough cut" tabIndex={0}>
          <div className="playhead" style={{ left: `${(time / duration) * 100}%` }} />
          <div className="lane aroll">
            {edit.keeps.map((keep) => {
              const start = domain === "program" ? keep.programIn : keep.sourceIn;
              const end = domain === "program" ? keep.programOut : keep.sourceOut;
              return <strong key={`${keep.sourceIn}-${keep.programIn}`} style={box(start, end, duration)} />;
            })}
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
                <strong key={`${hit.clipId}-${hit.sourceIn}`} style={box(start, end, duration)}>
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
      </div>
    </section>
  );
}

function box(start: number, end: number, duration: number): { left: string; width: string } {
  const safe = Math.max(duration, 0.001);
  return {
    left: `${(start / safe) * 100}%`,
    width: `${Math.max(0.35, ((end - start) / safe) * 100)}%`,
  };
}
