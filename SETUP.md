# Setup & Development Guide

How to run, test and work on the project. For what the app is and how to *use* it,
see [README.md](README.md); for status/history/plans, see [ROADMAP.md](ROADMAP.md).

## Prerequisites

- **Node.js 20+** (the project is developed on Node 22) and npm.
- A **Chromium-family browser** (Chrome/Edge) for the full experience — export uses
  WebCodecs, which Firefox doesn't ship yet (Safari 26+ also works).
- The browser tests download **Playwright's Chromium** on first run
  (`npx playwright install chromium` if it's missing).

## Run

```bash
git clone https://github.com/taing28/video-editing-tool.git
cd video-editing-tool
npm install
npm run dev        # editor at http://localhost:5173
```

Other scripts:

```bash
npm run build      # typecheck + production build (dist/)
npm run preview    # serve the production build
npm run verify     # the FULL gate — run before and after any change
```

**Rule of thumb: keep `npm run verify` green.** It runs the typecheck, all unit
tests, and every browser test below.

## Testing

Unit tests are Vitest (`src/**/*.test.ts` — time math, edit reducers, selectors,
caption grouping, layout). Browser tests are plain Playwright scripts in `scripts/`
that drive real Chromium and **fail on any console error**:

```bash
npm run test          # unit tests only
npm run e2e           # the full editing flow (~32 steps: import → edit → overlays →
                      #   voiceover → project round-trip → tour → keybinds)
npm run export:test   # exports a video, re-parses the file, checks tracks/size/duration
npm run video:test    # self-bootstraps an MP4, re-imports it, checks preview + re-export
npm run persist:test  # builds a project, reloads, asserts IndexedDB restore
npm run caption:smoke # OPTIONAL: downloads the real Whisper model and transcribes
                      #   (slow + network — not part of verify)
npm run verify        # typecheck + test + e2e + export + video + persist
```

Useful test plumbing (in `scripts/_harness.mjs`):

- The dev server for tests runs on port **4188**; `APP_URL` appends `?nopersist=1`,
  which **disables autosave/restore and the first-run tour prompt** so tests start
  from a clean slate.
- Synthetic media (PNG gradients, WAV tones) is generated in-process — no fixtures.
- The e2e stubs `getUserMedia` with a WebAudio tone for the voiceover step
  (Chromium's fake-device flags hang on headless macOS) and mocks the transcriber
  (`window.__transcribeOverride`) so auto-captions are tested without the model.

In dev builds the store is exposed as `window.__editor` (tests read state through it).

## Project structure

```
src/
  core/            the document + pure logic (NO DOM, NO React)
    time.ts          integer-frame math
    ids.ts           branded ids
    model.ts         Project / Track / Clip / Effect — pure serializable data
    selectors.ts     "what's visible/audible at frame N" (pure queries)
    edits.ts         move / trim / split / reorder / slideshow reducers
    snapping.ts      magnetic edge snapping
  render/          the render seam — ONE scene builder, TWO renderers
    scene.ts         buildScene(project, frame) → ordered layer list
    paint.ts         Canvas2D painter (export side)
    export.ts        deterministic frame loop + WebCodecs encode + audio mixdown
    colorFilter.ts   shared graded-canvas cache (preview/export parity)
    captionLayout.ts shared text measurement & wrapping (parity)
    kenburns.ts      pure pan/zoom box animation
  playback/        live preview audio (audioEngine, fades, ducking)
  captions/        on-device Whisper transcription + caption building
  media/           runtime media registry, mic recorder, filmstrip thumbnails
  store/           Zustand store, undo/redo, autosave (IndexedDB), project files
  help/            searchable feature guide + the guided-tour steps
  ui/              React components (Header, LeftDock, Preview, Timeline, …)
scripts/           Playwright browser tests + shared harness
```

## Architecture — two rules carry the design

1. **Time is integer frames** at the project's fps — never seconds/floats in the
   document. Conversions happen only at the edges (`src/core/time.ts`).
2. **The document is pure data; rendering is a pure function** of
   `(project, frame)`. [`buildScene`](src/render/scene.ts) returns an ordered layer
   list consumed by BOTH the Konva preview and the Canvas2D export painter — so any
   new effect appears in exports automatically, with pixel parity by construction.

Practical corollaries when adding features:

- New timeline capability → a **pure reducer** in `core/edits.ts` (+ unit test),
  exposed as a store action; interactive drags snapshot once (`beginInteraction`)
  and apply transiently so a gesture is ONE undo step.
- New visual element → a new `Effect` variant in `core/model.ts`, a layer type in
  `render/scene.ts`, and a renderer in BOTH `ui/Preview.tsx` and `render/paint.ts`
  (share any measurement through `render/captionLayout.ts`-style helpers).
- New persisted field → default it in `store/migrate.ts` so older saved projects
  still load (or make the field optional and default at read).

## Gotchas worth knowing

- A Zustand selector must not return a fresh array/object per call
  (`useEditor((s) => Object.values(...))` → infinite render loop). Select the stable
  reference, derive in render.
- `tsc -b` can emit a bogus TS5083 about `mediabunny/dist/tsconfig.json` from a stale
  cache — `rm -rf node_modules/.tmp` fixes it.
- Timeline lane labels are `position: sticky` — don't override their `position`, or
  the gutter scrolls away with the timeline.
- Reordering timeline rows can remount the row component mid-drag; that's why the
  row-drag gesture lives at module level (window listeners + store state), not in
  component state. Don't move it back.
