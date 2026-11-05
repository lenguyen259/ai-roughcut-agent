"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, type Clock } from "./Stage";
import { Timeline } from "./Timeline";
import { activeWordId, programToSource, runAgent, sourceToProgram } from "../lib/agent";
import { alignTranscript, analyzeChannel, wordsFromSpeech, type ChannelAnalysis } from "../lib/audio";
import type { Aspect } from "../lib/draw";
import { toDecisionJson, toEdl } from "../lib/edl";
import { CutPlayer } from "../lib/playback";
import { CLIPS, buildSample } from "../lib/sample";
import { DEFAULT_OPTIONS, type AgentOptions, type EditResult, type PlayDomain } from "../lib/types";
import { TimelineVoice } from "../lib/voice";

type LoadedMedia = {
  name: string;
  analysis: ChannelAnalysis;
  buffer: AudioBuffer;
};

const REPLACEMENTS = [
  ["Premiere", "CMX EDL"],
  ["Claude", "Local loop"],
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
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [playing, setPlaying] = useState(false);
  const [uiTime, setUiTime] = useState(0);
  const [sourceKind, setSourceKind] = useState<"demo" | "file">("demo");
  const [media, setMedia] = useState<LoadedMedia | null>(null);
  const [transcript, setTranscript] = useState("");
  const [appliedTranscript, setAppliedTranscript] = useState("");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);

  const clock = useRef<Clock>({ time: 0, playing: false });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const player = useRef(new CutPlayer());
  const voice = useRef(new TimelineVoice());
  const fileRef = useRef<HTMLInputElement>(null);
  const editRef = useRef(edit);
  const domainRef = useRef(domain);
  const sourceKindRef = useRef(sourceKind);
  const playingRef = useRef(false);
  const voiceOnRef = useRef(true);
  const alive = useRef(true);
  editRef.current = edit;
  domainRef.current = domain;
  sourceKindRef.current = sourceKind;
  voiceOnRef.current = voiceOn;

  useEffect(() => {
    alive.current = true;
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
        } else if (!audible) {
          clock.current.time += delta;
        }
        if (clock.current.time >= duration - 0.02) {
          clock.current.time = duration;
          playingRef.current = false;
          clock.current.playing = false;
          player.current.pause();
          voice.current.stop();
          setPlaying(false);
        } else if (!audible && voiceOnRef.current) {
          voice.current.follow(current, domainRef.current, clock.current.time, true, true);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const mirror = window.setInterval(() => setUiTime(clock.current.time), 120);
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

  const activeId = activeWordId(edit, uiTime, domain);
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
    clock.current.time = time;
    voice.current.retarget();
    setUiTime(time);
    if (playingRef.current && sourceKind === "file" && media) {
      void player.current.play({
        buffer: media.buffer,
        domain,
        keeps: current.keeps,
        from: time,
        duration,
        gain: current.loudness.linear,
      });
    }
  }

  function seekSource(sourceTime: number) {
    if (domain === "source") {
      seek(sourceTime);
      return;
    }
    seek(sourceToProgram(edit.keeps, sourceTime) ?? 0);
  }

  async function togglePlay() {
    const current = editRef.current;
    if (!current || recording) return;
    if (playingRef.current) {
      pause();
      return;
    }
    const duration = durationOf(current);
    let from = clock.current.time;
    if (from >= duration - 0.05) from = 0;
    clock.current.time = from;
    setUiTime(from);
    playingRef.current = true;
    clock.current.playing = true;
    setPlaying(true);
    if (sourceKind !== "file") {
      voice.current.unlock();
      voice.current.follow(current, domain, from, true, voiceOnRef.current, true);
    }
    if (sourceKind === "file" && media) {
      try {
        await player.current.play({
          buffer: media.buffer,
          domain,
          keeps: current.keeps,
          from,
          duration,
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
    clock.current.time = 0;
    setUiTime(0);
    try {
      const stream = canvas.captureStream(30);
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
          from: 0,
          duration,
          gain: current.loudness.linear,
        });
      }
      await new Promise<void>((resolve) => {
        const watch = () => {
          if (!alive.current || clock.current.time >= duration - 0.04) resolve();
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
      voice.current.follow(edit, domain, clock.current.time, true, true, true);
    }
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className={`tally ${playing || recording ? "live" : ""}`} />
          <div>
            <p className="eyebrow">Agent 01</p>
            <h1>Roughcut</h1>
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
              Demo episode
            </button>
            <button type="button" className={sourceKind === "file" ? "on" : ""} onClick={showLoadedFile}>
              Your audio
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
              <dt>Source</dt>
              <dd>{edit.sourceDuration.toFixed(1)}s</dd>
            </div>
            <div>
              <dt>Program</dt>
              <dd>{edit.programDuration.toFixed(1)}s</dd>
            </div>
            <div>
              <dt>Lifted</dt>
              <dd>{Math.round(edit.stats.removedRatio * 100)}%</dd>
            </div>
            <div>
              <dt>B-roll</dt>
              <dd>{edit.broll.length}</dd>
            </div>
          </dl>

          <ol className="log">
            {logs.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ol>

          <div className="exports">
            <button type="button" onClick={() => downloadText("roughcut.edl", toEdl(edit), "text/plain")}>
              Download EDL
            </button>
            <button type="button" onClick={() => downloadText("roughcut.json", toDecisionJson(edit), "application/json")}>
              Download JSON
            </button>
            <button type="button" onClick={() => void record()} disabled={recording}>
              {recording ? "Recording…" : "Record preview"}
            </button>
          </div>
          <p className="hint">EDL is CMX 3600. Shotcut, Kdenlive, and DaVinci Resolve import it without Premiere.</p>
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
              {playing ? "Pause" : "Play"}
            </button>
            <div className="segmented">
              <button type="button" className={domain === "program" ? "on" : ""} onClick={() => switchDomain("program")}>
                Program
              </button>
              <button type="button" className={domain === "source" ? "on" : ""} onClick={() => switchDomain("source")}>
                Source
              </button>
            </div>
            <div className="segmented">
              <button type="button" className={aspect === "16:9" ? "on" : ""} onClick={() => setAspect("16:9")}>
                16:9
              </button>
              <button type="button" className={aspect === "9:16" ? "on" : ""} onClick={() => setAspect("9:16")}>
                9:16
              </button>
            </div>
            <button type="button" className={voiceOn ? "on" : ""} onClick={toggleVoice}>
              {voiceOn ? "Voice on" : "Voice off"}
            </button>
          </div>
          <div className="stage-shell">
            <Stage edit={edit} aspect={aspect} domain={domain} clock={clock} canvasRef={canvasRef} />
          </div>
          {error ? <p className="error">{error}</p> : null}
          <p className="hint center">Play speaks each caption with the timeline. Pause and seek cut the voice off at the playhead.</p>
        </section>

        <aside className="transcript">
          <header>
            <h2>Transcript</h2>
            <p>{edit.stats.fillerCount} fillers · {edit.captions.length} captions</p>
          </header>
          {sourceKind === "file" ? (
            <textarea
              value={transcript}
              placeholder="Paste a transcript. Words are laid across detected speech, then fillers and B-roll run locally."
              onChange={(event) => setTranscript(event.target.value)}
            />
          ) : null}
          <div className="words">
            {edit.words.map((word, index) => {
              const previous = edit.words[index - 1];
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

      <Timeline edit={edit} domain={domain} time={uiTime} onSeek={seek} />
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
