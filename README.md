# Roughcut Agent

Browser rough-cut desk for a talking-head episode. It lifts fillers and long silences, drops semantic B-roll, burns kinetic captions, reframes 16:9 to 9:16, and exports a CMX 3600 EDL. Decoding, search, and playback stay in the tab.

## Free replacements

| Paid tool in the original pipeline | What this build uses |
| --- | --- |
| Adobe Premiere Pro / ExtendScript | Timeline, program/source monitor, and a CMX 3600 EDL that Shotcut, Kdenlive, and DaVinci Resolve import |
| Claude Code | A local decision loop with an inspectable log |
| faster-whisper | Web Audio energy VAD, plus a transcript you paste or the built-in demo |
| Paid embedding APIs | 64-d hashed bag-of-words vectors and cosine search over a local visual library |
| ElevenLabs / Runway / Midjourney | Not used. Picture is drawn on canvas. Optional voice is `speechSynthesis` |

## Run

```bash
npm install
npm run verify
npm run dev
```

Open the demo episode, press Play, then switch the monitor between Program and Source. Source shows lifted breaths. Drop in your own audio and paste a transcript to rerun the same loop. Nothing is uploaded.

## Export

- `roughcut.edl` — CMX 3600 video events
- `roughcut.json` — keep ranges, B-roll scores, captions, loudness
- WebM — a picture recording of the monitor. Uploaded audio is mixed in when the browser allows it
