import { programToSource } from "./agent";
import type { BrollHit, CaptionCue, ClipId, EditResult, PlayDomain } from "./types";
import { formatTimecode } from "./time";

export type Aspect = "16:9" | "9:16";

type PaintInput = {
  edit: EditResult;
  aspect: Aspect;
  domain: PlayDomain;
  time: number;
  live: boolean;
};

const FRAME: Record<Aspect, { w: number; h: number }> = {
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
};

export const HOST_CLOSED_MOUTH = 3.55;

export function hostOnCamera(edit: EditResult, domain: PlayDomain, time: number): boolean {
  const sourceTime = domain === "source" ? time : programToSource(edit.keeps, time);
  const lifted = domain === "source" && edit.lifted.some((span) => sourceTime >= span.start && sourceTime <= span.end);
  if (lifted) return false;
  const onBroll = edit.broll.some((hit) => {
    if (domain === "program") return time >= hit.programIn && time < hit.programOut;
    return sourceTime >= hit.sourceIn && sourceTime < hit.sourceOut;
  });
  if (onBroll) return false;
  const bridge = 0.08;
  return edit.words.some((word) => !word.filler && sourceTime >= word.start - bridge && sourceTime <= word.end + bridge);
}

type SceneId = "aroll" | ClipId;

export function paint(canvas: HTMLCanvasElement, input: PaintInput): void {
  const size = FRAME[input.aspect];
  if (canvas.width !== size.w || canvas.height !== size.h) {
    canvas.width = size.w;
    canvas.height = size.h;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { w, h } = size;
  ctx.clearRect(0, 0, w, h);
  const sourceTime = input.domain === "source" ? input.time : programToSource(input.edit.keeps, input.time);
  const lifted = input.domain === "source" && input.edit.lifted.some((span) => sourceTime >= span.start && sourceTime <= span.end);
  const broll = findBroll(input.edit, input.domain, input.time, sourceTime, lifted);
  const talking = input.live && hostOnCamera(input.edit, input.domain, input.time);
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : input.time;

  drawScene(ctx, broll?.clipId ?? "aroll", w, h, motion, talking, "");
  vignette(ctx, w, h);
  if (broll && !lifted) chip(ctx, broll.title, w);
  if (lifted) drawLift(ctx, w, h);
  const caption = findCaption(input.edit, input.domain, input.time);
  if (caption && !lifted) drawCaption(ctx, caption, input.domain, input.time, w, h);
  burnIn(ctx, input, sourceTime, w, h);
}

function findBroll(edit: EditResult, domain: PlayDomain, time: number, sourceTime: number, lifted: boolean): BrollHit | null {
  if (lifted) return null;
  return (
    edit.broll.find((hit) => {
      if (domain === "program") return time >= hit.programIn && time < hit.programOut;
      return sourceTime >= hit.sourceIn && sourceTime < hit.sourceOut;
    }) ?? null
  );
}

function findCaption(edit: EditResult, domain: PlayDomain, time: number): CaptionCue | null {
  return (
    edit.captions.find((cue) => {
      const start = domain === "program" ? cue.programIn : cue.sourceIn;
      const end = domain === "program" ? cue.programOut : cue.sourceOut;
      return time >= start && time < end;
    }) ?? null
  );
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: SceneId,
  w: number,
  h: number,
  time: number,
  speaking: boolean,
  word: string,
): void {
  switch (scene) {
    case "aroll":
      drawAroll(ctx, w, h, time, speaking, word);
      return;
    case "coffee":
      drawCoffee(ctx, w, h, time);
      return;
    case "timeline":
      drawTimeline(ctx, w, h, time);
      return;
    case "chart":
      drawChart(ctx, w, h, time);
      return;
    case "phone":
      drawPhone(ctx, w, h, time);
      return;
    case "city":
      drawCity(ctx, w, h, time);
      return;
    case "mic":
      drawMic(ctx, w, h, time);
      return;
    default: {
      const unexpected: never = scene;
      return unexpected;
    }
  }
}

function drawAroll(ctx: CanvasRenderingContext2D, w: number, h: number, _time: number, speaking: boolean, _word: string): void {
  const scrim = ctx.createLinearGradient(0, h * 0.58, 0, h);
  scrim.addColorStop(0, "rgba(0,0,0,0)");
  scrim.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, h * 0.58, w, h * 0.42);
  ctx.fillStyle = speaking ? "#e10600" : "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.arc(w * 0.048, h * 0.055, Math.max(5, w * 0.006), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f6f1e8";
  ctx.textAlign = "left";
  ctx.font = `700 ${Math.max(13, Math.floor(w / 56))}px Arial, Helvetica, sans-serif`;
  ctx.fillText("SUNDAY SHIP", w * 0.068, h * 0.062);
  const strapY = h * (w < h ? 0.62 : 0.66);
  const strapH = Math.max(52, Math.floor(h * 0.1));
  const strapW = Math.min(w * 0.52, 460);
  ctx.fillStyle = "rgba(8,8,10,0.8)";
  ctx.fillRect(w * 0.048, strapY, strapW, strapH);
  ctx.fillStyle = "#e6a15a";
  ctx.fillRect(w * 0.048, strapY, strapW, 4);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.max(20, Math.floor(w / 32))}px Georgia, serif`;
  ctx.fillText("Host", w * 0.048 + 16, strapY + strapH * 0.46);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = `600 ${Math.max(12, Math.floor(w / 62))}px Arial, Helvetica, sans-serif`;
  ctx.fillText("Sunday Ship  ·  Talking head", w * 0.048 + 16, strapY + strapH * 0.78);
}

function drawCoffee(ctx: CanvasRenderingContext2D, w: number, h: number, _time: number): void {
  gradient(ctx, w, h, "#3a2418", "#120d0b");
  ctx.fillStyle = "#6b3a22";
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.78, w * 0.34, h * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  const cupX = w * 0.38;
  const cupY = h * 0.4;
  const cupW = w * 0.24;
  const cupH = h * 0.28;
  round(ctx, cupX, cupY, cupW, cupH, 18, "#f4efe6");
  ctx.fillStyle = "#4a2a18";
  ctx.fillRect(cupX + 8, cupY + 8, cupW - 16, h * 0.05);
  label(ctx, "Morning pour", w, h);
}

function drawTimeline(ctx: CanvasRenderingContext2D, w: number, h: number, _time: number): void {
  gradient(ctx, w, h, "#12151c", "#07080c");
  round(ctx, w * 0.08, h * 0.18, w * 0.84, h * 0.64, 18, "#0e1218");
  const rows = [0.32, 0.46, 0.6];
  rows.forEach((row, rowIndex) => {
    for (let index = 0; index < 5; index += 1) {
      const gap = rowIndex === 1 && (index === 1 || index === 3);
      if (gap) continue;
      const x = w * (0.14 + index * 0.15);
      round(ctx, x, h * row, w * 0.12, h * 0.08, 8, rowIndex === 0 ? "#e6a15a" : "#3a342c");
    }
  });
  ctx.fillStyle = "#f3ecdf";
  ctx.fillRect(w * 0.42, h * 0.24, 2, h * 0.5);
  label(ctx, "Timeline pass", w, h);
}

function drawChart(ctx: CanvasRenderingContext2D, w: number, h: number, _time: number): void {
  gradient(ctx, w, h, "#102018", "#08110d");
  const bars = [0.28, 0.36, 0.33, 0.48, 0.44, 0.62, 0.58];
  bars.forEach((value, index) => {
    const height = h * value * 0.85;
    round(ctx, w * (0.16 + index * 0.1), h * 0.72 - height, w * 0.06, height, 8, index === bars.length - 1 ? "#e6a15a" : "#3a342c");
  });
  ctx.strokeStyle = "#f3ecdf";
  ctx.lineWidth = 3;
  ctx.beginPath();
  bars.forEach((value, index) => {
    const x = w * (0.19 + index * 0.1);
    const y = h * 0.7 - h * value * 0.72;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  label(ctx, "Retention", w, h);
}

function drawPhone(ctx: CanvasRenderingContext2D, w: number, h: number, _time: number): void {
  gradient(ctx, w, h, "#20140f", "#090909");
  const phoneW = Math.min(w, h) * 0.34;
  const phoneH = phoneW * 1.9;
  const x = w * 0.5 - phoneW / 2;
  const y = h * 0.5 - phoneH / 2;
  round(ctx, x, y, phoneW, phoneH, 28, "#f3ecdf");
  round(ctx, x + 10, y + 12, phoneW - 20, phoneH - 24, 20, "#16120f");
  ctx.fillStyle = "#e6a15a";
  ctx.font = "700 28px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("9:16", w * 0.5, y + phoneH * 0.42);
  round(ctx, x + 28, y + phoneH * 0.72, (phoneW - 56) * 0.62, 8, 4, "#e6a15a");
  label(ctx, "Vertical", w, h);
}

function drawCity(ctx: CanvasRenderingContext2D, w: number, h: number, _time: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#1b2448");
  sky.addColorStop(1, "#d06a45");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#f3ecdf";
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.18, Math.min(w, h) * 0.05, 0, Math.PI * 2);
  ctx.fill();
  for (let index = 0; index < 10; index += 1) {
    const bw = w * (0.06 + (index % 3) * 0.02);
    const bh = h * (0.18 + (index % 5) * 0.08);
    const x = w * 0.04 + index * w * 0.095;
    ctx.fillStyle = "#141820";
    ctx.fillRect(x, h * 0.78 - bh, bw, bh + h * 0.22);
    if (index % 2 === 0) {
      ctx.fillStyle = "rgba(255, 206, 120, 0.55)";
      ctx.fillRect(x + bw * 0.35, h * 0.78 - bh * 0.6, bw * 0.15, bh * 0.12);
    }
  }
  label(ctx, "Night upload", w, h);
}

function drawMic(ctx: CanvasRenderingContext2D, w: number, h: number, _time: number): void {
  gradient(ctx, w, h, "#16141c", "#09090d");
  const cx = w * 0.5;
  const cy = h * 0.46;
  ctx.strokeStyle = "rgba(230,161,90,0.65)";
  ctx.lineWidth = 3;
  for (let index = 1; index <= 3; index += 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) * (0.12 + index * 0.08), 0, Math.PI * 2);
    ctx.stroke();
  }
  round(ctx, cx - 28, cy - 70, 56, 110, 28, "#f3ecdf");
  round(ctx, cx - 16, cy - 52, 32, 48, 16, "#242028");
  ctx.fillStyle = "#f3ecdf";
  ctx.fillRect(cx - 3, cy + 40, 6, h * 0.16);
  label(ctx, "Voice booth", w, h);
}

function drawLift(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(80, 10, 18, 0.55)";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255, 93, 115, 0.45)";
  ctx.lineWidth = 2;
  for (let x = -h; x < w; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + h, 0);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffd0d6";
  ctx.font = "700 48px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("LIFTED", w / 2, h / 2);
  ctx.restore();
}

function drawCaption(ctx: CanvasRenderingContext2D, cue: CaptionCue, domain: PlayDomain, time: number, w: number, h: number): void {
  const size = Math.max(28, Math.floor(w / 28));
  ctx.font = `800 ${size}px Arial, Helvetica, sans-serif`;
  ctx.textBaseline = "middle";
  const gap = size * 0.35;
  const widths = cue.words.map((word) => ctx.measureText(word.text).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, cue.words.length - 1);
  const boxW = Math.min(w * 0.9, total + size);
  const boxH = size * 1.7;
  const boxX = (w - boxW) / 2;
  const boxY = h * (w < h ? 0.78 : 0.8);
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  let cursor = boxX + (boxW - total) / 2;
  const mid = boxY + boxH / 2;
  cue.words.forEach((word, index) => {
    const start = domain === "program" ? word.programIn : word.sourceIn;
    const end = domain === "program" ? word.programOut : word.sourceOut;
    const active = time >= start && time < end;
    ctx.fillStyle = active ? "#ffffff" : "rgba(255,255,255,0.45)";
    ctx.textAlign = "left";
    ctx.fillText(word.text, cursor, mid);
    cursor += (widths[index] ?? 0) + gap;
  });
}

function burnIn(ctx: CanvasRenderingContext2D, input: PaintInput, sourceTime: number, w: number, h: number): void {
  ctx.save();
  ctx.font = "600 16px Consolas, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(243, 236, 223, 0.8)";
  const program = input.domain === "program" ? input.time : sourceTime;
  ctx.fillText(`${input.domain === "program" ? "PGM" : "SRC"}  ${formatTimecode(program)}`, w - 28, 36);
  ctx.fillText(input.aspect, w - 28, 58);
  ctx.restore();
}

function gradient(ctx: CanvasRenderingContext2D, w: number, h: number, from: string, to: string): void {
  const paint = ctx.createLinearGradient(0, 0, 0, h);
  paint.addColorStop(0, from);
  paint.addColorStop(1, to);
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, w, h);
}

function vignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const paint = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.72);
  paint.addColorStop(0, "rgba(0,0,0,0)");
  paint.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, w, h);
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function label(ctx: CanvasRenderingContext2D, text: string, w: number, h: number): void {
  const size = Math.max(28, Math.floor(w / 22));
  ctx.textAlign = "left";
  ctx.fillStyle = "#e6a15a";
  ctx.fillRect(w * 0.08, h * 0.62, Math.min(72, w * 0.08), 4);
  ctx.font = `700 ${Math.max(12, Math.floor(w / 58))}px Arial, Helvetica, sans-serif`;
  ctx.fillText("CUTAWAY", w * 0.08, h * 0.6);
  ctx.fillStyle = "#f6f1e8";
  ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`;
  ctx.fillText(text, w * 0.08, h * 0.68);
}

function chip(ctx: CanvasRenderingContext2D, title: string, w: number): void {
  ctx.font = "700 16px Arial, Helvetica, sans-serif";
  const width = ctx.measureText(title).width + 24;
  ctx.fillStyle = "rgba(8,8,10,0.72)";
  ctx.fillRect(w - width - 28, 28, width, 32);
  ctx.fillStyle = "#e6a15a";
  ctx.fillRect(w - width - 28, 28, width, 3);
  ctx.fillStyle = "#f6f1e8";
  ctx.textAlign = "left";
  ctx.fillText(title, w - width - 16, 50);
}
