# Roughcut Agent

Browser copilot for a long raw interview or vlog. The agent proposes a rough cut: fillers and silence already lifted, B-roll already on a track. A person accepts or rejects each hit, then exports a CMX 3600 EDL to finish in Shotcut, Kdenlive, or DaVinci Resolve.

The demo rushes are word timings across a 5–20 minute timeline. An uploaded audio file is the path for your own rushes. Nothing is uploaded.

## Free replacements

| Paid tool in the original pipeline | What this build uses |
| --- | --- |
| Adobe Premiere Pro / ExtendScript | Bins, a multi-track timeline, and a CMX 3600 EDL |
| Claude Code | A local decision loop with an inspectable log |
| faster-whisper | Web Audio energy VAD, plus a transcript you paste or the built-in rushes |
| Paid embedding APIs | 64-d hashed bag-of-words vectors and cosine search over a local visual library |
| ElevenLabs / Runway / Midjourney | Not used. The host plate is `public/host.mp4`. Optional review voice is `speechSynthesis` |

## Run

```bash
npm install
npm run verify
npm run dev
```

Open the demo rushes. Review a section on the program monitor. Accept or reject lifts and B-roll, then download the EDL. The rough cut is not the finished show.

## Export

- `roughcut.edl` — CMX 3600 video events for the accepted cut
- `roughcut.json` — keep ranges, B-roll scores, captions, loudness
- WebM — a short section recording of the program monitor, with the host plate composited
