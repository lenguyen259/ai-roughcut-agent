import { programToSource } from "./agent";
import type { BrollHit, CaptionCue, ClipId, EditResult, PlayDomain } from "./types";
import { formatTimecode } from "./time";

export type Aspect = "16:9" | "9:16";

type PaintInput = {
  edit: EditResult;
  aspect: Aspect;
  domain: PlayDomain;
  time: number;
};

const FRAME: Record<Aspect, { w: number; h: number }> = {
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
};

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
  const activeWord = input.edit.words.find((word) => !word.filler && sourceTime >= word.start && sourceTime <= word.end);
  const speaking = Boolean(activeWord) && !lifted;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : input.time;

  drawScene(ctx, broll?.clipId ?? "aroll", w, h, motion, speaking, activeWord?.text ?? "");
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

function drawAroll(ctx: CanvasRenderingContext2D, w: number, h: number, _time: number, _speaking: boolean, _word: string): void {
  const shade = ctx.createLinearGradient(0, 0, 0, h * 0.28);
  shade.addColorStop(0, "rgba(0,0,0,0.55)");
  shade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h * 0.28);
  const plateW = Math.min(340, w * 0.46);
  round(ctx, 28, 28, plateW, 64, 8, "rgba(8,8,10,0.72)");
  ctx.fillStyle = "#ff6a2a";
  ctx.fillRect(28, 28, 6, 64);
  ctx.fillStyle = "#f6f1e8";
  ctx.textAlign = "left";
  ctx.font = "700 24px Georgia, serif";
  ctx.fillText("HOST", 48, 54);
  ctx.font = "600 14px Segoe UI, sans-serif";
  ctx.fillStyle = "#d9d0c3";
  ctx.fillText("CAM A  ·  SUNDAY SHIP", 48, 76);
}

function drawCoffee(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
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
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 3;
  for (let index = 0; index < 3; index += 1) {
    ctx.beginPath();
    const origin = cupX + cupW * (0.3 + index * 0.2);
    ctx.moveTo(origin, cupY);
    for (let step = 0; step < 12; step += 1) {
      const y = cupY - step * h * 0.018;
      const x = origin + Math.sin(time * 2.4 + step * 0.7 + index) * 10;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  label(ctx, "B-ROLL  ·  MORNING POUR", w, h);
}

function drawTimeline(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  gradient(ctx, w, h, "#12151c", "#07080c");
  round(ctx, w * 0.08, h * 0.18, w * 0.84, h * 0.64, 18, "#0e1218");
  const rows = [0.32, 0.46, 0.6];
  rows.forEach((row, rowIndex) => {
    for (let index = 0; index < 5; index += 1) {
      const gap = rowIndex === 1 && (index === 1 || index === 3);
      if (gap) continue;
      const x = w * (0.14 + index * 0.15);
      round(ctx, x, h * row, w * 0.12, h * 0.08, 8, rowIndex === 0 ? "#ff6a2a" : "#2f6fed");
    }
  });
  const playhead = w * (0.18 + ((time * 0.15) % 0.68));
  ctx.fillStyle = "#f3ecdf";
  ctx.fillRect(playhead, h * 0.24, 2, h * 0.5);
  label(ctx, "B-ROLL  ·  TIMELINE PASS", w, h);
}

function drawChart(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  gradient(ctx, w, h, "#102018", "#08110d");
  const bars = [0.28, 0.36, 0.33, 0.48, 0.44, 0.62, 0.58];
  bars.forEach((value, index) => {
    const height = h * value * (0.85 + Math.sin(time + index) * 0.04);
    round(ctx, w * (0.16 + index * 0.1), h * 0.72 - height, w * 0.06, height, 8, index === bars.length - 1 ? "#b6f27c" : "#1f8a70");
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
  label(ctx, "B-ROLL  ·  RETENTION", w, h);
}

function drawPhone(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  gradient(ctx, w, h, "#20140f", "#090909");
  const phoneW = Math.min(w, h) * 0.34;
  const phoneH = phoneW * 1.9;
  const x = w * 0.5 - phoneW / 2;
  const y = h * 0.5 - phoneH / 2;
  round(ctx, x, y, phoneW, phoneH, 28, "#f3ecdf");
  round(ctx, x + 10, y + 12, phoneW - 20, phoneH - 24, 20, "#16120f");
  ctx.fillStyle = "#ff6a2a";
  ctx.font = "700 28px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("9:16", w * 0.5, y + phoneH * 0.42);
  const progress = (time % 2.4) / 2.4;
  round(ctx, x + 28, y + phoneH * 0.72, (phoneW - 56) * progress, 8, 4, "#b6f27c");
  label(ctx, "B-ROLL  ·  VERTICAL", w, h);
}

function drawCity(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
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
    if ((index + Math.floor(time)) % 2 === 0) {
      ctx.fillStyle = "rgba(255, 206, 120, 0.8)";
      ctx.fillRect(x + bw * 0.35, h * 0.78 - bh * 0.6, bw * 0.15, bh * 0.12);
    }
  }
  label(ctx, "B-ROLL  ·  NIGHT UPLOAD", w, h);
}

function drawMic(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  gradient(ctx, w, h, "#16141c", "#09090d");
  const cx = w * 0.5;
  const cy = h * 0.46;
  ctx.strokeStyle = "rgba(255,106,42,0.7)";
  ctx.lineWidth = 3;
  for (let index = 1; index <= 3; index += 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) * (0.12 + index * 0.08) + Math.sin(time * 2 + index) * 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  round(ctx, cx - 28, cy - 70, 56, 110, 28, "#f3ecdf");
  round(ctx, cx - 16, cy - 52, 32, 48, 16, "#242028");
  ctx.fillStyle = "#f3ecdf";
  ctx.fillRect(cx - 3, cy + 40, 6, h * 0.16);
  label(ctx, "B-ROLL  ·  VOICE BOOTH", w, h);
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
  ctx.font = "700 64px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("LIFT", w / 2, h / 2);
  ctx.restore();
}

function drawCaption(ctx: CanvasRenderingContext2D, cue: CaptionCue, domain: PlayDomain, time: number, w: number, h: number): void {
  const size = Math.max(32, Math.floor(w / 24));
  ctx.font = `800 ${size}px "Segoe UI", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const widths = cue.words.map((word) => ctx.measureText(`${word.text} `).width);
  const total = widths.reduce((sum, width) => sum + width, 0);
  let cursor = (w - total) / 2;
  const mid = h * (w < h ? 0.78 : 0.84);
  cue.words.forEach((word, index) => {
    const start = domain === "program" ? word.programIn : word.sourceIn;
    const end = domain === "program" ? word.programOut : word.sourceOut;
    const active = time >= start && time < end;
    ctx.lineWidth = Math.max(6, size * 0.16);
    ctx.strokeStyle = "#111";
    ctx.strokeText(word.text, cursor, mid);
    ctx.fillStyle = active ? "#ffe14a" : "#ffffff";
    ctx.fillText(word.text, cursor, mid);
    cursor += widths[index] ?? 0;
  });
}

function burnIn(ctx: CanvasRenderingContext2D, input: PaintInput, sourceTime: number, w: number, h: number): void {
  ctx.save();
  ctx.font = "600 22px Consolas, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(243, 236, 223, 0.86)";
  const program = input.domain === "program" ? input.time : sourceTime;
  ctx.fillText(`${input.domain === "program" ? "PGM" : "SRC"}  ${formatTimecode(program)}`, 28, h - 28);
  ctx.textAlign = "right";
  ctx.fillText(input.aspect, w - 28, h - 28);
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
  ctx.font = "700 22px Segoe UI, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(243,236,223,0.8)";
  ctx.fillText(text, 28, h * 0.1);
  ctx.textAlign = "right";
  ctx.fillText("FREE LIBRARY", w - 28, h * 0.1);
}

function chip(ctx: CanvasRenderingContext2D, title: string, w: number): void {
  ctx.font = "700 20px Segoe UI, sans-serif";
  const width = ctx.measureText(title).width + 28;
  round(ctx, w - width - 24, 56, width, 36, 18, "rgba(255,106,42,0.92)");
  ctx.fillStyle = "#1a0d07";
  ctx.textAlign = "left";
  ctx.fillText(title, w - width - 10, 80);
}
