"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, type Clock } from "./Stage";
import { Timeline } from "./Timeline";
import { activeWordId, applyDecisions, brollKey, liftKey, liftLabel, programToSource, runAgent, sourceToProgram } from "../lib/agent";
import { alignTranscript, analyzeChannel, wordsFromSpeech, type ChannelAnalysis } from "../lib/audio";
import { toDecisionJson, toEdl } from "../lib/edl";
import { CutPlayer } from "../lib/playback";
import { CLIPS, buildSample } from "../lib/sample";
import { formatTimecode } from "../lib/time";
import { DEFAULT_OPTIONS, type AgentOptions, type EditResult, type PlayDomain } from "../lib/types";
import { FrameVoice, spokenWords } from "../lib/voice";

type LoadedMedia = {
  name: string;
  analysis: ChannelAnalysis;
  buffer: AudioBuffer;
};

const REVIEW_SECONDS = 12;

const REPLACEMENTS = [
  ["Premiere", "Timeline bay"],
  ["Claude", "Local copilot"],
  ["Whisper", "Web Audio VAD"],
  ["Embeddings", "Hashed vectors"],
];

export function Studio() {
  const sample = useMemo(() => buildSample(), []);
  const initial = useMemo(
    () => runAgent(sample.words, CLIPS, DEFAULT_OPTIONS, { sourceDuration: sample.sourceDuration }),
    [sample],
  );
  const [options, setOptions] = useState<AgentOptions>(DEFAULT_OPTIONS);
  const [applied, setApplied] = useState<AgentOptions>(DEFAULT_OPTIONS);
  const [edit, setEdit] = useState<EditResult>(initial);
  const [logs, setLogs] = useState<string[]>(initial.logs);
  const [running, setRunning] = useState(false);
  const [domain, setDomain] = useState<PlayDomain>("program");
  const [playing, setPlaying] = useState(false);
  const [uiTime, setUiTime] = useState(0);
  const [sourceKind, setSourceKind] = useState<"demo" | "file">("demo");
  const [media, setMedia] = useState<LoadedMedia | null>(null);
  const [transcript, setTranscript] = useState("");
  const [appliedTranscript, setAppliedTranscript] = useState("");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [rejectedLifts, setRejectedLifts] = useState<string[]>([]);
  const [rejectedBroll, setRejectedBroll] = useState<string[]>([]);
  const resolved = useMemo(
    () => applyDecisions(edit, { rejectedLiftKeys: rejectedLifts, rejectedBrollKeys: rejectedBroll }),
    [edit, rejectedLifts, rejectedBroll],
  );

  const clock = useRef<Clock>({ time: 0, playing: false });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const player = useRef(new CutPlayer());
  const voice = useRef(new FrameVoice());
  const fileRef = useRef<HTMLInputElement>(null);
  const editRef = useRef(edit);
  const domainRef = useRef(domain);
  const sourceKindRef = useRef(sourceKind);
  const playingRef = useRef(false);
  const voiceOnRef = useRef(true);
  const alive = useRef(true);
  const sectionUntil = useRef(0);
  editRef.current = resolved;
  domainRef.current = domain;
  sourceKindRef.current = sourceKind;
  voiceOnRef.current = voiceOn;

  useEffect(() => {
    alive.current = true;
    voice.current.onEnded = (time) => {
      clock.current.time = time;
      clock.current.playing = false;
      playingRef.current = false;
      setPlaying(false);
      setUiTime(time);
    };
    return () => {
      alive.current = false;
      player.current.halt();
      voice.current.stop();
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      const current = editRef.current;
      if (playingRef.current && current) {
        const duration = domainRef.current === "program" ? current.programDuration : current.sourceDuration;
        const audible = sourceKindRef.current === "file";
        if (audible && player.current.isPlaying()) {
          clock.current.time = player.current.getTime();
        } else if (!audible && voiceOnRef.current && voice.current.isRunning()) {
          const sample = voice.current.sample();
          if (sample !== null) clock.current.time = sample;
        } else if (!audible) {
          clock.current.time += delta;
        }
        const end = sectionUntil.current > 0 ? sectionUntil.current : duration;
        if (clock.current.time >= end - 0.02) {
          clock.current.time = end;
          playingRef.current = false;
          clock.current.playing = false;
          player.current.pause();
          voice.current.stop();
          setPlaying(false);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const mirror = window.setInterval(() => setUiTime(clock.current.time), 40);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(mirror);
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      if (event.code !== "Space") return;
      event.preventDefault();
      void togglePlay();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const activeId = activeWordId(resolved, uiTime, domain);
  const dirty =
    options.silenceThreshold !== applied.silenceThreshold ||
    options.aggressiveFillers !== applied.aggressiveFillers ||
    options.brollThreshold !== applied.brollThreshold ||
    options.brollSeconds !== applied.brollSeconds ||
    (sourceKind === "file" && transcript !== appliedTranscript);

  useEffect(() => {
    if (!activeId) return;
    document.getElementById(`word-${activeId}`)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function durationOf(current: EditResult, nextDomain = domain): number {
    return nextDomain === "program" ? current.programDuration : current.sourceDuration;
  }

  function beginSection(current: EditResult, from: number, wrap: boolean): number {
    const duration = durationOf(current);
    const start = wrap && from >= duration - 0.05 ? 0 : Math.min(duration, Math.max(0, from));
    sectionUntil.current = Math.min(duration, start + REVIEW_SECONDS);
    return start;
  }

  function reviewWords(current: EditResult, from: number) {
    return spokenWords(current, domain, from).filter((word) => word.start < sectionUntil.current - 0.02);
  }

  function pause() {
    if (sourceKind === "file") clock.current.time = player.current.pause();
    playingRef.current = false;
    clock.current.playing = false;
    voice.current.stop();
    setPlaying(false);
    setUiTime(clock.current.time);
  }

  function seek(next: number) {
    const current = editRef.current;
    const duration = durationOf(current);
    const time = Math.min(Math.max(0, next), duration);
    const playing = playingRef.current;
    const start = playing ? beginSection(current, time, false) : time;
    clock.current.time = start;
    setUiTime(start);
    if (playing && sourceKind !== "file" && voiceOnRef.current) {
      voice.current.start(reviewWords(current, start), start);
    } else {
      voice.current.stop();
    }
    if (playing && sourceKind === "file" && media) {
      void player.current.play({
        buffer: media.buffer,
        domain,
        keeps: current.keeps,
        from: start,
        duration: sectionUntil.current,
        gain: current.loudness.linear,
      });
    }
  }

  function seekSource(sourceTime: number) {
    const current = editRef.current;
    if (domain === "source") {
      seek(sourceTime);
      return;
    }
    seek(sourceToProgram(current.keeps, sourceTime) ?? 0);
  }

  async function togglePlay() {
    const current = editRef.current;
    if (!current || recording) return;
    if (playingRef.current) {
      pause();
      return;
    }
    const from = beginSection(current, clock.current.time, true);
    clock.current.time = from;
    setUiTime(from);
    playingRef.current = true;
    clock.current.playing = true;
    setPlaying(true);
    if (sourceKind !== "file" && voiceOnRef.current) {
      voice.current.start(reviewWords(current, from), from);
    }
    if (sourceKind === "file" && media) {
      try {
        await player.current.play({
          buffer: media.buffer,
          domain,
          keeps: current.keeps,
          from,
          duration: sectionUntil.current,
          gain: current.loudness.linear,
        });
      } catch {
        playingRef.current = false;
        clock.current.playing = false;
        setPlaying(false);
        setError("Playback could not start.");
      }
    }
  }

  function switchDomain(next: PlayDomain) {
    const current = editRef.current;
    pause();
    const time = clock.current.time;
    const mapped = next === "source" ? programToSource(current.keeps, time) : (sourceToProgram(current.keeps, time) ?? 0);
    setDomain(next);
    clock.current.time = mapped;
    setUiTime(mapped);
  }

  async function run() {
    if (running) return;
    setRunning(true);
    setError("");
    pause();
    const started = performance.now();
    const next = computeEdit();
    const elapsed = performance.now() - started;
    for (let index = 0; index < next.logs.length; index += 1) {
      if (!alive.current) return;
      setLogs(next.logs.slice(0, index + 1));
      await wait(120);
    }
    if (!alive.current) return;
    setLogs([...next.logs, `Finished on-device in ${elapsed.toFixed(1)} ms.`]);
    setEdit(next);
    setRejectedLifts([]);
    setRejectedBroll([]);
    setApplied(options);
    setAppliedTranscript(transcript);
    clock.current.time = 0;
    setUiTime(0);
    setRunning(false);
  }

  function computeEdit(): EditResult {
    if (sourceKind === "file" && media) {
      const words = transcript.trim() ? alignTranscript(transcript, media.analysis.speech) : wordsFromSpeech(media.analysis.speech);
      return runAgent(words, CLIPS, options, {
        sourceDuration: media.analysis.duration,
        peaks: media.analysis.peaks,
        rmsDb: media.analysis.rmsDb,
      });
    }
    const episode = buildSample();
    return runAgent(episode.words, CLIPS, options, { sourceDuration: episode.sourceDuration });
  }

  async function onFile(file: File) {
    if (file.size > 40 * 1024 * 1024) {
      setError("Keep the file under 40 MB. Decoding stays in this tab.");
      return;
    }
    setError("");
    pause();
    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      const analysis = analyzeChannel(decoded.getChannelData(0), decoded.sampleRate);
      if (analysis.speech.length === 0) {
        setError("No speech rose above the noise floor.");
        return;
      }
      const loaded = { name: file.name, analysis, buffer: decoded };
      setMedia(loaded);
      setSourceKind("file");
      setRejectedLifts([]);
      setRejectedBroll([]);
      const words = transcript.trim() ? alignTranscript(transcript, analysis.speech) : wordsFromSpeech(analysis.speech);
      const next = runAgent(words, CLIPS, options, {
        sourceDuration: analysis.duration,
        peaks: analysis.peaks,
        rmsDb: analysis.rmsDb,
      });
      setEdit(next);
      setLogs(next.logs);
      setApplied(options);
      setAppliedTranscript(transcript);
      clock.current.time = 0;
      setUiTime(0);
    } catch {
      setError("This browser could not decode that file. Use WAV, MP3, or M4A.");
    } finally {
      await context.close();
    }
  }

  function showLoadedFile() {
    if (!media) {
      fileRef.current?.click();
      return;
    }
    pause();
    setSourceKind("file");
    setError("");
    setRejectedLifts([]);
    setRejectedBroll([]);
    const words = transcript.trim() ? alignTranscript(transcript, media.analysis.speech) : wordsFromSpeech(media.analysis.speech);
    const next = runAgent(words, CLIPS, options, {
      sourceDuration: media.analysis.duration,
      peaks: media.analysis.peaks,
      rmsDb: media.analysis.rmsDb,
    });
    setEdit(next);
    setLogs(next.logs);
    setApplied(options);
    setAppliedTranscript(transcript);
    clock.current.time = 0;
    setUiTime(0);
  }

  function useDemo() {
    pause();
    setSourceKind("demo");
    setError("");
    setRejectedLifts([]);
    setRejectedBroll([]);
    const episode = buildSample();
    const next = runAgent(episode.words, CLIPS, options, { sourceDuration: episode.sourceDuration });
    setEdit(next);
    setLogs(next.logs);
    setApplied(options);
    clock.current.time = 0;
    setUiTime(0);
  }

  async function record() {
    const canvas = canvasRef.current;
    const current = editRef.current;
    if (!canvas || !current || recording) return;
    const duration = durationOf(current);
    if (duration < 0.2) return;
    setRecording(true);
    setError("");
    pause();
    const from = beginSection(current, 0, false);
    clock.current.time = from;
    setUiTime(0);
    let pump = 0;
    try {
      const host = canvas.parentElement?.querySelector("video") ?? null;
      const buffer = document.createElement("canvas");
      buffer.width = canvas.width;
      buffer.height = canvas.height;
      const layer = buffer.getContext("2d");
      const stream = layer ? buffer.captureStream(30) : canvas.captureStream(30);
      const paintRecord = () => {
        if (layer) {
          const focus = buffer.height > buffer.width ? 0.22 : 0.42;
          if (host instanceof HTMLVideoElement && host.readyState >= 2 && host.videoWidth > 0) {
            const scale = Math.max(buffer.width / host.videoWidth, buffer.height / host.videoHeight);
            const dw = host.videoWidth * scale;
            const dh = host.videoHeight * scale;
            layer.drawImage(host, (buffer.width - dw) / 2, (buffer.height - dh) * focus, dw, dh);
          } else {
            layer.fillStyle = "#14161a";
            layer.fillRect(0, 0, buffer.width, buffer.height);
          }
          layer.drawImage(canvas, 0, 0);
        }
        pump = requestAnimationFrame(paintRecord);
      };
      if (layer) pump = requestAnimationFrame(paintRecord);
      if (sourceKind === "file" && media) {
        player.current.captureStream()?.getAudioTracks().forEach((track) => stream.addTrack(track));
      }
      const mime = pickMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start();
      playingRef.current = true;
      clock.current.playing = true;
      setPlaying(true);
      if (sourceKind === "file" && media) {
        await player.current.play({
          buffer: media.buffer,
          domain,
          keeps: current.keeps,
          from,
          duration: sectionUntil.current,
          gain: current.loudness.linear,
        });
      }
      await new Promise<void>((resolve) => {
        const watch = () => {
          if (!alive.current || clock.current.time >= sectionUntil.current - 0.04) resolve();
          else requestAnimationFrame(watch);
        };
        requestAnimationFrame(watch);
      });
      playingRef.current = false;
      clock.current.playing = false;
      setPlaying(false);
      player.current.pause();
      recorder.stop();
      await stopped;
      downloadBlob(new Blob(chunks, { type: "video/webm" }), "roughcut-preview.webm");
    } catch {
      setError("This browser blocked the WebM recorder.");
      playingRef.current = false;
      setPlaying(false);
    } finally {
      cancelAnimationFrame(pump);
      setRecording(false);
    }
  }

  function toggleVoice() {
    if (!("speechSynthesis" in window)) {
      setError("This browser has no speech synthesis.");
      return;
    }
    const next = !voiceOn;
    setVoiceOn(next);
    voiceOnRef.current = next;
    if (!next) voice.current.stop();
    else if (playingRef.current && sourceKind !== "file") {
      voice.current.start(reviewWords(editRef.current, clock.current.time), clock.current.time);
    }
  }

  function setLift(key: string, accept: boolean) {
    pause();
    setRejectedLifts((current) => (accept ? current.filter((item) => item !== key) : current.includes(key) ? current : [...current, key]));
  }

  function setBroll(key: string, accept: boolean) {
    pause();
    setRejectedBroll((current) => (accept ? current.filter((item) => item !== key) : current.includes(key) ? current : [...current, key]));
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className={`tally ${playing || recording ? "live" : ""}`} />
          <div>
            <p className="eyebrow">Copilot</p>
            <h1>Roughcut</h1>
            <p className="role">You finish the timeline</p>
          </div>
        </div>
        <ul className="chips">
          {REPLACEMENTS.map(([from, to]) => (
            <li key={from}>
              <span>{from}</span>
              <b>{to}</b>
            </li>
          ))}
        </ul>
        <p className="privacy">Audio never leaves this browser.</p>
      </header>

      <section className="workspace">
        <aside className="rail">
          <div className="source-switch">
            <button type="button" className={sourceKind === "demo" ? "on" : ""} onClick={useDemo}>
              Demo rushes
            </button>
            <button type="button" className={sourceKind === "file" ? "on" : ""} onClick={showLoadedFile}>
              Your rushes
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,video/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onFile(file);
                event.target.value = "";
              }}
            />
          </div>
          {media ? (
            <p className="file-name">
              {media.name}
              <button type="button" onClick={() => fileRef.current?.click()}>
                Replace
              </button>
            </p>
          ) : null}

          <p className="bin-label">B-roll bin</p>
          <ul className="bin">
            {CLIPS.map((clip) => (
              <li key={clip.id}>{clip.title}</li>
            ))}
          </ul>

          <label className="slider">
            <span>Silence gate {options.silenceThreshold.toFixed(2)}s</span>
            <input
              type="range"
              min={0.25}
              max={1.2}
              step={0.05}
              value={options.silenceThreshold}
              onChange={(event) => setOptions({ ...options, silenceThreshold: Number(event.target.value) })}
            />
          </label>
          <label className="slider">
            <span>B-roll gate {options.brollThreshold.toFixed(2)}</span>
            <input
              type="range"
              min={0.05}
              max={0.75}
              step={0.01}
              value={options.brollThreshold}
              onChange={(event) => setOptions({ ...options, brollThreshold: Number(event.target.value) })}
            />
          </label>
          <label className="slider">
            <span>B-roll length {options.brollSeconds.toFixed(1)}s</span>
            <input
              type="range"
              min={1.2}
              max={4}
              step={0.1}
              value={options.brollSeconds}
              onChange={(event) => setOptions({ ...options, brollSeconds: Number(event.target.value) })}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={options.aggressiveFillers}
              onChange={(event) => setOptions({ ...options, aggressiveFillers: event.target.checked })}
            />
            Lift hesitations (like, you know, basically)
          </label>

          <button type="button" className="primary" onClick={() => void run()} disabled={running}>
            {running ? "Reading the cut…" : dirty ? "Run agent · settings changed" : "Run agent"}
          </button>

          <dl className="stats">
            <div>
              <dt>Rushes</dt>
              <dd>{formatTimecode(edit.sourceDuration)}</dd>
            </div>
            <div>
              <dt>Rough cut</dt>
              <dd>{formatTimecode(resolved.programDuration)}</dd>
            </div>
            <div>
              <dt>Lifted</dt>
              <dd>{Math.round(resolved.stats.removedRatio * 100)}%</dd>
            </div>
            <div>
              <dt>B-roll</dt>
              <dd>{resolved.broll.length}</dd>
            </div>
          </dl>

          <section className="decisions" aria-label="Proposed lifts">
            <h2>Lifts</h2>
            {edit.lifted.map((span) => {
              const key = liftKey(span);
              const accepted = !rejectedLifts.includes(key);
              return (
                <article key={key} className={accepted ? "decision" : "decision rejected"}>
                  <p>
                    <strong>{formatTimecode(span.start)}</strong>
                    {liftLabel(edit, span)}
                  </p>
                  <div>
                    <button type="button" className={accepted ? "on" : ""} onClick={() => setLift(key, true)}>
                      Accept
                    </button>
                    <button type="button" className={accepted ? "" : "on"} onClick={() => setLift(key, false)}>
                      Reject
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
          <section className="decisions" aria-label="Proposed B-roll">
            <h2>B-roll hits</h2>
            {edit.broll.map((hit) => {
              const key = brollKey(hit);
              const accepted = !rejectedBroll.includes(key);
              return (
                <article key={key} className={accepted ? "decision" : "decision rejected"}>
                  <p>
                    <strong>{formatTimecode(hit.programIn)}</strong>
                    {hit.title}
                  </p>
                  <div>
                    <button type="button" className={accepted ? "on" : ""} onClick={() => setBroll(key, true)}>
                      Accept
                    </button>
                    <button type="button" className={accepted ? "" : "on"} onClick={() => setBroll(key, false)}>
                      Reject
                    </button>
                  </div>
                </article>
              );
            })}
          </section>

          <ol className="log">
            {logs.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ol>

          <div className="exports">
            <button type="button" onClick={() => downloadText("roughcut.edl", toEdl(resolved), "text/plain")}>
              Download EDL
            </button>
            <button type="button" onClick={() => downloadText("roughcut.json", toDecisionJson(resolved), "application/json")}>
              Download JSON
            </button>
            <button type="button" onClick={() => void record()} disabled={recording}>
              {recording ? "Recording…" : "Record preview"}
            </button>
          </div>
          <p className="hint">CMX 3600 EDL. Finish the accepted cut in Shotcut, Kdenlive, or DaVinci Resolve.</p>
        </aside>

        <section
          className="stage-wrap"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) void onFile(file);
          }}
        >
          <div className="monitor-bar">
            <button type="button" className="primary" onClick={() => void togglePlay()}>
              {playing ? "Pause" : "Review section"}
            </button>
            <div className="segmented">
              <button type="button" className={domain === "program" ? "on" : ""} onClick={() => switchDomain("program")}>
                Program
              </button>
              <button type="button" className={domain === "source" ? "on" : ""} onClick={() => switchDomain("source")}>
                Rushes
              </button>
            </div>
            <button type="button" className={voiceOn ? "on" : ""} onClick={toggleVoice}>
              {voiceOn ? "Review voice on" : "Review voice"}
            </button>
          </div>
          <div className="stage-shell">
            <Stage edit={resolved} aspect="16:9" domain={domain} clock={clock} canvasRef={canvasRef} />
          </div>
          {error ? <p className="error">{error}</p> : null}
          <p className="hint center">Review a section of the rough cut. Accept or reject lifts and B-roll, then finish the timeline elsewhere.</p>
        </section>

        <aside className="transcript">
          <header>
            <h2>Rushes</h2>
            <p>{resolved.stats.fillerCount} fillers still out · {resolved.broll.length} B-roll on the cut</p>
          </header>
          {sourceKind === "file" ? (
            <textarea
              value={transcript}
              placeholder="Paste a transcript for your rushes. The copilot lifts fillers and places B-roll. You finish the timeline."
              onChange={(event) => setTranscript(event.target.value)}
            />
          ) : null}
          <div className="words">
            {resolved.words.map((word, index) => {
              const previous = resolved.words[index - 1];
              const gap = previous ? word.start - previous.end : word.start;
              return (
                <span key={word.id} className="token">
                  {gap >= applied.silenceThreshold ? <em>{gap.toFixed(1)}s</em> : null}
                  <button
                    type="button"
                    id={`word-${word.id}`}
                    className={word.filler ? "word cut" : word.id === activeId ? "word now" : "word"}
                    onClick={() => seekSource(word.start)}
                  >
                    {word.text}
                  </button>
                </span>
              );
            })}
          </div>
        </aside>
      </section>

      <Timeline edit={resolved} domain={domain} time={uiTime} onSeek={seek} />
    </main>
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function downloadText(filename: string, content: string, type: string): void {
  downloadBlob(new Blob([content], { type }), filename);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) return "video/webm;codecs=vp9";
  if (MediaRecorder.isTypeSupported("video/webm")) return "video/webm";
  return "";
}
