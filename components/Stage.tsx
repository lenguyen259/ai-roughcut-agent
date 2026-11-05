"use client";

import { useEffect, useRef, type RefObject } from "react";
import { paint, type Aspect } from "../lib/draw";
import type { EditResult, PlayDomain } from "../lib/types";

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
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      video.pause();
      return;
    }
    void video.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    let frame = 0;
    const loop = () => {
      const canvas = canvasRef.current;
      const current = snapshot.current.edit;
      if (canvas && current) {
        paint(canvas, {
          edit: current,
          aspect: snapshot.current.aspect,
          domain: snapshot.current.domain,
          time: clock.current?.time ?? 0,
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
        autoPlay
        aria-hidden="true"
      />
      <canvas ref={canvasRef} className="preview" aria-label="Edit preview" />
    </div>
  );
}
