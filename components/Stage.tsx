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
  const snapshot = useRef({ edit, aspect, domain });
  snapshot.current = { edit, aspect, domain };

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

  return <canvas ref={canvasRef} className={aspect === "9:16" ? "preview vertical" : "preview"} aria-label="Edit preview" />;
}
