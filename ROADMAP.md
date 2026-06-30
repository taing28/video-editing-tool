# Roadmap & Resume Guide

A single place to see what's built, what's next, and how to pick this project back up
in a future session. (The `README.md` has the architecture; this file is the plan.)

## How to resume

```bash
git clone https://github.com/taing28/video-editing-tool.git
cd video-editing-tool
npm install
npm run dev      # open the editor (http://localhost:5173)
npm run verify   # FULL gate: typecheck + unit + e2e + export + video + persist
```

**Rule of thumb:** keep `npm run verify` green. Run it before and after any change.
Architecture overview + file map: see `README.md`. Tests live in `scripts/` (Playwright)
and `src/**/*.test.ts` (Vitest).

## Status: Phase 9 complete ✅ — `npm run verify` green (24 unit + e2e + export + video + persist)

## Phases done

- [x] **0 — Foundations** — Vite + React 19 + TS; integer-frame time model; undo/redo;
  Zustand store; three-panel shell.
- [x] **1 — MVP loop** — import → drag onto a track → trim / split / move → preview → export.
- [x] **2 — Export** — mediabunny `CanvasSource` (deterministic frame loop over `buildScene`)
  + `OfflineAudioContext` audio mixdown → H.264 MP4 (VP9/VP8 WebM fallback). No ffmpeg.
- [x] **3 — Video & audio preview** — audible playback, frame-accurate `<video>`,
  multi-track, aspect-ratio presets.
- [x] **4 — Direct manipulation** — drag/resize elements on the preview, opacity, audio
  waveforms, autosave/restore (IndexedDB).
- [x] **5 — Effects & mixing** — per-clip volume, fade in/out (video opacity + audio gain),
  background color.
- [x] **6 — Transitions & snapping** — cross-dissolve on clip overlap, magnetic snapping.
- [x] **7 — UI & media** — filmstrip thumbnails, per-track mute/hide, media delete,
  editable name + fps, snapping toggle. (+ adversarial-review hardening.)
- [x] **8 — Export controls** — resolution / quality / format dialog + cancel.
- [x] **9 — Captions** — caption effect (centered, outlined subtitle) + overlays list to
  re-select any text/caption.
- [x] **10 — Auto-captions** — on-device Whisper (transformers.js) transcribes the audio into
  timed captions. Lazy-loaded (~60 MB, fp32). Flow is mock-tested in e2e; the real model is
  build-verified + checked by `npm run caption:smoke`. (`src/captions/`.)

- [x] **11 — Speed control** — per-clip 0.25×–4× for video & audio. Changing speed re-times the
  clip length (keeps the same source content); `sourceFrameAt`/trim/audio playbackRate are all
  speed-aware. (`setClipSpeed` in `src/core/edits.ts`.)

- [x] **12 — Shapes & lower-thirds** — rectangle effect (3rd effect type) with drag/resize on
  the preview + a one-click lower-third (bar + text). (`ShapeEffect` in `src/core/model.ts`.)

## Phases planned (pick any — not strictly ordered)

- [ ] **13 — More transitions** — wipe / slide / fade-to-color between clips.
- [ ] **Stickers** — image/emoji overlays (reuse the shape interaction + an image source).
- [ ] **14 — Export presets** — one-click TikTok / Reels / YouTube / Square (sets aspect +
  resolution together).
- [ ] **15 — Scale** — move render+encode into a Web Worker. NOTE: `OfflineAudioContext`
  (audio mix) and `<video>` seeking (frame-accurate video) are main-thread-only, so a worker
  mainly helps pure image+audio projects and needs a main-thread fallback for video.
- [ ] **Electron** — wrap as a desktop app (real Save/Open files, native-speed/unbounded
  export via mediabunny's server backend). Same UI; export goes through one clean seam.

## Known deferred items (small)

- `setFps` doesn't rescale existing clip frame counts (change fps early in a project).
- Re-selecting an effect from the preview canvas isn't wired (use the inspector Overlays list).
- The waveform's shared decode `AudioContext` isn't closed (single instance, harmless).

## Two golden rules (don't break these)

1. **Time is integer frames** at the project fps — never seconds/floats in the document.
2. **`buildScene(project, frame)` is the single render path** — the preview and the export
   both consume it, so new effects appear in the export automatically.
