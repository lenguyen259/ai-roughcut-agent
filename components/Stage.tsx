"use client";

import { useEffect, useRef, type RefObject } from "react";
import { HOST_CLOSED_MOUTH, hostOnCamera, paint, type Aspect } from "../lib/draw";
import type { EditResult, PlayDomain } from "../lib/types";

function holdHost(video: HTMLVideoElement): void {
  if (video.readyState >= 1 && Math.abs(video.currentTime - HOST_CLOSED_MOUTH) > 0.07) {
    video.currentTime = HOST_CLOSED_MOUTH;
  }
  if (!video.paused) video.pause();
}

export type Clock = {
  time: number;
  playing: boolean;
};

type StageProps = {
  edit: EditResult | null;
  aspect: Aspect;
  domain: PlayDomain;
  clock: RefObject<Clock | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
};

export function Stage({ edit, aspect, domain, clock, canvasRef }: StageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const snapshot = useRef({ edit, aspect, domain });
  snapshot.current = { edit, aspect, domain };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const park = () => holdHost(video);
    if (video.readyState >= 1) park();
    else video.addEventListener("loadeddata", park, { once: true });
  }, []);

  useEffect(() => {
    let frame = 0;
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const loop = () => {
      const canvas = canvasRef.current;
      const current = snapshot.current.edit;
      const time = clock.current?.time ?? 0;
      const playing = clock.current?.playing ?? false;
      const reduced = reducedQuery.matches;
      const domain = snapshot.current.domain;
      const live = current ? playing && !reduced && hostOnCamera(current, domain, time) : false;
      const video = videoRef.current;
      if (video) {
        if (live) {
          if (video.paused) void video.play().catch(() => undefined);
        } else {
          holdHost(video);
        }
      }
      if (canvas && current) {
        paint(canvas, {
          edit: current,
          aspect: snapshot.current.aspect,
          domain,
          time,
          live: playing && !reduced,
        });
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [canvasRef, clock]);

  return (
    <div className={aspect === "9:16" ? "gate vertical" : "gate"}>
      <video
        ref={videoRef}
        className="plate"
        src="/host.mp4"
        muted
        playsInline
        loop
        preload="auto"
        data-closed="3.55"
        aria-hidden="true"
      />
      <canvas ref={canvasRef} className="preview" aria-label="Edit preview" />
    </div>
  );
}
