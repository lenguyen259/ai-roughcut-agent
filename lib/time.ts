export function formatTimecode(seconds: number, fps = 30): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const totalFrames = Math.round(safe * fps);
  const frames = totalFrames % fps;
  const wholeSeconds = Math.floor(totalFrames / fps);
  const secs = wholeSeconds % 60;
  const mins = Math.floor(wholeSeconds / 60) % 60;
  const hours = Math.floor(wholeSeconds / 3600);
  return [hours, mins, secs].map((part) => String(part).padStart(2, "0")).join(":") + ":" + String(frames).padStart(2, "0");
}

export function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const mins = Math.floor(safe / 60);
  const secs = safe - mins * 60;
  return `${mins}:${secs.toFixed(2).padStart(5, "0")}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
