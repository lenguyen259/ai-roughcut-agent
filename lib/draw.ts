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

function drawAroll(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, speaking: boolean, word: string): void {
  const portrait = h > w;
  const cx = w * (portrait ? 0.5 : 0.46) + Math.sin(time * 1.15) * 5;
  const head = Math.min(w, h) * (portrait ? 0.2 : 0.23);
  const cy = h * (portrait ? 0.36 : 0.4);

  const wall = ctx.createLinearGradient(0, 0, 0, h);
  wall.addColorStop(0, "#3a2a22");
  wall.addColorStop(0.42, "#16120f");
  wall.addColorStop(1, "#090807");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255, 214, 170, 0.08)";
  ctx.fillRect(w * 0.08, h * 0.08, w * 0.22, h * 0.34);
  const key = ctx.createRadialGradient(cx - head * 1.1, cy - head * 1.5, 10, cx, cy, head * 3.4);
  key.addColorStop(0, "rgba(255, 196, 140, 0.55)");
  key.addColorStop(1, "rgba(255, 196, 140, 0)");
  ctx.fillStyle = key;
  ctx.fillRect(0, 0, w, h);
  const rim = ctx.createRadialGradient(cx + head * 2.1, cy - head * 0.2, 8, cx + head, cy, head * 2.6);
  rim.addColorStop(0, "rgba(150, 186, 255, 0.28)");
  rim.addColorStop(1, "rgba(150, 186, 255, 0)");
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#241910";
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.9, w * 0.38, h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  const jacket = ctx.createLinearGradient(cx - head * 2, cy, cx + head * 2, h);
  jacket.addColorStop(0, "#3d4c68");
  jacket.addColorStop(0.45, "#243044");
  jacket.addColorStop(1, "#151b28");
  ctx.fillStyle = jacket;
  ctx.beginPath();
  ctx.moveTo(cx - head * 2.35, h);
  ctx.quadraticCurveTo(cx - head * 1.85, cy + head * 1.05, cx - head * 0.72, cy + head * 0.92);
  ctx.quadraticCurveTo(cx, cy + head * 1.35, cx + head * 0.72, cy + head * 0.92);
  ctx.quadraticCurveTo(cx + head * 1.85, cy + head * 1.05, cx + head * 2.35, h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - head * 0.42, cy + head * 1.05);
  ctx.lineTo(cx - head * 0.08, cy + head * 1.85);
  ctx.moveTo(cx + head * 0.42, cy + head * 1.05);
  ctx.lineTo(cx + head * 0.08, cy + head * 1.85);
  ctx.stroke();
  ctx.fillStyle = "#f7f1e8";
  ctx.beginPath();
  ctx.moveTo(cx - head * 0.22, cy + head * 0.95);
  ctx.lineTo(cx, cy + head * 1.7);
  ctx.lineTo(cx + head * 0.22, cy + head * 0.95);
  ctx.closePath();
  ctx.fill();

  round(ctx, cx - head * 0.2, cy + head * 0.78, head * 0.4, head * 0.42, head * 0.16, "#e8b894");

  ctx.fillStyle = "#c98462";
  ctx.beginPath();
  ctx.ellipse(cx - head * 0.86, cy + head * 0.08, head * 0.14, head * 0.22, -0.25, 0, Math.PI * 2);
  ctx.ellipse(cx + head * 0.86, cy + head * 0.08, head * 0.14, head * 0.22, 0.25, 0, Math.PI * 2);
  ctx.fill();

  const skin = ctx.createRadialGradient(cx - head * 0.28, cy - head * 0.4, head * 0.08, cx, cy + head * 0.1, head * 1.05);
  skin.addColorStop(0, "#ffe4cc");
  skin.addColorStop(0.62, "#f0b892");
  skin.addColorStop(1, "#d08a68");
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(cx, cy + head * 0.04, head * 0.78, head * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1b140f";
  ctx.beginPath();
  ctx.moveTo(cx - head * 0.72, cy - head * 0.18);
  ctx.quadraticCurveTo(cx - head * 0.9, cy - head * 0.95, cx - head * 0.05, cy - head * 1.05);
  ctx.quadraticCurveTo(cx + head * 0.85, cy - head * 0.95, cx + head * 0.74, cy - head * 0.12);
  ctx.quadraticCurveTo(cx + head * 0.35, cy - head * 0.48, cx + head * 0.05, cy - head * 0.5);
  ctx.quadraticCurveTo(cx - head * 0.28, cy - head * 0.38, cx - head * 0.72, cy - head * 0.18);
  ctx.fill();
  const sheen = ctx.createLinearGradient(cx - head * 0.2, cy - head, cx + head * 0.4, cy - head * 0.3);
  sheen.addColorStop(0, "rgba(255, 220, 180, 0)");
  sheen.addColorStop(0.5, "rgba(255, 220, 180, 0.18)");
  sheen.addColorStop(1, "rgba(255, 220, 180, 0)");
  ctx.fillStyle = sheen;
  ctx.fill();

  ctx.fillStyle = "rgba(214, 96, 82, 0.18)";
  ctx.beginPath();
  ctx.ellipse(cx - head * 0.36, cy + head * 0.28, head * 0.13, head * 0.07, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + head * 0.36, cy + head * 0.28, head * 0.13, head * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  const blink = time % 4.8 > 4.62;
  drawEye(ctx, cx - head * 0.3, cy - head * 0.02, head, blink);
  drawEye(ctx, cx + head * 0.3, cy - head * 0.02, head, blink);
  ctx.strokeStyle = "#5c3b32";
  ctx.lineWidth = Math.max(2.5, head * 0.04);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - head * 0.46, cy - head * 0.22);
  ctx.quadraticCurveTo(cx - head * 0.3, cy - head * 0.34, cx - head * 0.12, cy - head * 0.2);
  ctx.moveTo(cx + head * 0.14, cy - head * 0.2);
  ctx.quadraticCurveTo(cx + head * 0.32, cy - head * 0.34, cx + head * 0.48, cy - head * 0.22);
  ctx.stroke();

  ctx.strokeStyle = "rgba(168, 96, 74, 0.85)";
  ctx.lineWidth = Math.max(2, head * 0.028);
  ctx.beginPath();
  ctx.moveTo(cx, cy + head * 0.08);
  ctx.quadraticCurveTo(cx + head * 0.1, cy + head * 0.24, cx, cy + head * 0.3);
  ctx.stroke();

  drawMouth(ctx, cx, cy + head * 0.48, head, speaking, word, time);

  ctx.strokeStyle = "#c5ccd6";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - head * 1.35, h * 0.86);
  ctx.quadraticCurveTo(cx - head * 1.05, cy + head * 1.15, cx - head * 0.95, cy + head * 1.05);
  ctx.stroke();
  ctx.fillStyle = "#e8edf2";
  ctx.beginPath();
  ctx.ellipse(cx - head * 0.95, cy + head * 1.02, head * 0.11, head * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a313c";
  ctx.beginPath();
  ctx.ellipse(cx - head * 0.95, cy + head * 1.0, head * 0.045, head * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  const plateY = h - 108;
  round(ctx, 28, plateY, Math.min(360, w * 0.42), 68, 10, "rgba(8,8,10,0.78)");
  ctx.fillStyle = "#ff6a2a";
  ctx.fillRect(28, plateY, 7, 68);
  ctx.fillStyle = "#f6f1e8";
  ctx.textAlign = "left";
  ctx.font = "700 26px Georgia, serif";
  ctx.fillText("HOST", 48, plateY + 30);
  ctx.font = "600 15px Segoe UI, sans-serif";
  ctx.fillStyle = "#d9d0c3";
  ctx.fillText("CAM A  ·  SUNDAY SHIP", 48, plateY + 52);
}

function drawEye(ctx: CanvasRenderingContext2D, x: number, y: number, head: number, blink: boolean): void {
  ctx.fillStyle = "#fffaf6";
  ctx.beginPath();
  ctx.ellipse(x, y, head * 0.13, blink ? head * 0.02 : head * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  if (blink) return;
  ctx.fillStyle = "#3a2a24";
  ctx.beginPath();
  ctx.arc(x + head * 0.02, y, head * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#16100e";
  ctx.beginPath();
  ctx.arc(x + head * 0.02, y, head * 0.025, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x + head * 0.045, y - head * 0.03, head * 0.016, 0, Math.PI * 2);
  ctx.fill();
}

function drawMouth(ctx: CanvasRenderingContext2D, x: number, y: number, head: number, speaking: boolean, word: string, time: number): void {
  const shape = mouthShape(word, speaking, time);
  if (shape === "rest") {
    ctx.strokeStyle = "#a85a58";
    ctx.lineWidth = Math.max(3, head * 0.045);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - head * 0.16, y);
    ctx.quadraticCurveTo(x, y + head * 0.06, x + head * 0.16, y);
    ctx.stroke();
    return;
  }
  const open = shape === "round" ? 0.16 : shape === "wide" ? 0.1 : shape === "closed" ? 0.035 : 0.12;
  const wide = shape === "wide" ? 0.22 : shape === "round" ? 0.14 : 0.18;
  ctx.fillStyle = "#6e2430";
  ctx.beginPath();
  ctx.ellipse(x, y, head * wide, head * open, 0, 0, Math.PI * 2);
  ctx.fill();
  if (shape !== "closed") {
    ctx.fillStyle = "#f4efe8";
    ctx.fillRect(x - head * wide * 0.55, y - head * open * 0.15, head * wide * 1.1, Math.max(2, head * 0.035));
  }
  ctx.strokeStyle = "#c47674";
  ctx.lineWidth = Math.max(2, head * 0.03);
  ctx.beginPath();
  ctx.ellipse(x, y - head * open * 0.2, head * wide, head * open * 0.55, 0, Math.PI, 0);
  ctx.stroke();
}

function mouthShape(word: string, speaking: boolean, time: number): "rest" | "wide" | "round" | "closed" | "open" {
  if (!speaking) return "rest";
  const token = word.toLowerCase();
  const flap = Math.abs(Math.sin(time * 16));
  if (flap < 0.18) return "closed";
  if (/[oôuùú]/.test(token)) return "round";
  if (/[ieyí]/.test(token)) return "wide";
  if (/^[mbp]/.test(token)) return "closed";
  return "open";
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
  const text = cue.words.map((word) => word.text).join(" ");
  ctx.font = `700 ${Math.max(28, Math.floor(w / 28))}px Segoe UI, sans-serif`;
  const width = Math.min(w * 0.86, ctx.measureText(text).width + 48);
  const y = h * (w < h ? 0.74 : 0.8);
  round(ctx, (w - width) / 2, y, width, Math.max(54, h * 0.07), 14, "rgba(8, 8, 10, 0.78)");
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let cursor = (w - width) / 2 + 24;
  const mid = y + Math.max(54, h * 0.07) / 2;
  for (const word of cue.words) {
    const start = domain === "program" ? word.programIn : word.sourceIn;
    const end = domain === "program" ? word.programOut : word.sourceOut;
    const active = time >= start && time < end;
    ctx.font = `700 ${Math.max(28, Math.floor(w / 28))}px Segoe UI, sans-serif`;
    ctx.fillStyle = active ? "#ff6a2a" : "#f3ecdf";
    ctx.fillText(word.text, cursor, mid);
    cursor += ctx.measureText(`${word.text} `).width;
  }
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
  paint.addColorStop(1, "rgba(0,0,0,0.48)");
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
