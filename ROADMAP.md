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

## Status: Phase 21 + hardening pass complete ✅ — `npm run verify` green (54 unit + e2e + export + video + persist)

### UI polish (user feedback)
- **Collapsible + resizable side panels** — `ui/Sidebar.tsx` wraps the library + inspector:
  drag-to-resize handle (180–480px, persisted to localStorage), a ‹/› toggle that slides the panel
  to 0 width (clip layer keeps the toggle reachable). e2e step 1b covers collapse/expand/resize.
- **No scrollbars / theme fixes** — hid native scrollbars app-wide (index.css); inspector inputs
  now `width:100%` and `.field-row` wraps, so the panel never overflows horizontally (kills the
  stray white scrollbar). The "black preview" users hit is a hidden Video track (the 🚫/👁 toggle).
- **Preview overflow** — the stage spilled into the timeline because the middle grid row was
  `1fr` (= `minmax(auto,1fr)`, grows to content) and the scale used the padding-box height. Fixed:
  `grid-template-rows: … minmax(0,1fr) …`, `.preview { overflow:hidden; min-height:0; padding:0 }`,
  and a 0.96 fit factor on the stage scale. Collapse toggle is now a taller, centered edge tab.

### Hardening pass (adversarial review of Phases 16–21)
- **Media leak on project replace** — `loadProject`/`newProject` swapped the document but never
  released the OUTGOING project's runtime media (object URLs + File blobs), so each open/new
  leaked the prior project's media. Added `registry.disposeUnusedMedia(keep)`, called on load/new.
- **Invalid project-file open** — `void openProjectFile(f)` swallowed the rejection from a bad
  file → unhandled promise rejection + zero user feedback. Toolbar Save/Open now `.catch` with a
  `console.warn` + a friendly alert; e2e step 19d proves a non-JSON file leaves the project intact.

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

- [x] **13 — Transition styles** — dissolve / wipe / slide across a clip overlap. Picked per
  clip in the inspector; rendered with parity in preview (Konva clip/offset) + export (Canvas2D).

- [x] **14 — Ken Burns** — animated pan/zoom over a clip (`kenBurnsBox` in `src/render/kenburns.ts`;
  applied in buildScene, frozen for the clip being edited). Pure box animation → preview + export
  parity for free.

- [x] **15 — Audio ducking** — per-clip "duck under voice"; auto-lowers music while non-ducked
  audio plays. `voiceIntervals` (selectors) + `computeDuckRamps`/`scheduleDuck` (`src/playback/duck.ts`)
  applied in the preview engine + export mixdown.

- [x] **16 — Color adjustments** — per-image-clip brightness / contrast / saturation (+ B&W /
  Vivid presets). Parity by construction: both preview AND export resolve the SAME cached,
  CSS-filtered canvas via `getFilteredCanvas` (`src/render/colorFilter.ts`), so the graded pixels
  are identical. `ColorAdjust` on `VideoClip`; e2e proves the grade changes preview luminance.

- [x] **17 — Object-fit (Fit / Fill / Stretch)** — reframe a visual clip into the canvas:
  contain (letterbox), cover (crop to fill — the reels reframe for landscape media in a vertical
  canvas), or stretch. Reuses the transform box (overflow clips to the canvas in both renderers)
  → zero new rendering. `coverBox` (`model.ts`) + `fitClip` (`edits.ts`); inspector buttons.

- [x] **18 — Overlay fade in/out** — text / caption / shape overlays ramp opacity in and out
  instead of popping. Optional `fadeInFrames`/`fadeOutFrames` on `BaseEffect`; `effectOpacity`
  (selectors) reuses `fadeEnvelope`; folded into each overlay layer's opacity (parity: Konva
  `opacity` prop = export `globalAlpha`). Shared `OverlayFadeFields` inspector control; a selected
  overlay edits at its base opacity (ignores the fade), like a selected clip ignores its transition.

- [x] **19 — Color grading for video** — extends Phase 16 to video clips. `getFilteredCanvas`
  gains a `dynamic` mode: a STABLE per-(clip,size) scratch canvas repainted from the video's
  current frame on every call (no content caching). The preview re-grades dynamic layers right
  before each Konva redraw (RAF loop, seek handler, and a layout effect for paused edits — a
  stable canvas ref doesn't signal Konva to repaint); the export re-grades per frame via the same
  path. video-test proves the preview brightens (+45%) and a graded video still exports.

- [x] **20 — Project file save/open** — one portable file (timeline + every media asset's bytes
  as data URLs) so a project can be backed up, shared, or moved between machines. `src/store/
  projectFile.ts` (`buildProjectBundle`/`importProjectBundle`); migration extracted to `migrate.ts`
  (shared with autosave); Toolbar 💾 Save / 📂 Open. e2e proves a full round-trip in a clean app.

- [x] **21 — Duplicate clip / overlay** — `duplicateClip` (clone onto the track end, fresh id +
  effectIds) and `duplicateEffect` (clone nudged +20px) in `edits.ts`; `duplicateSelected` store
  action; ⧉ Duplicate toolbar button + ⌘/Ctrl+D. Handy for repeating a configured photo or title.

## Phases planned (pick any — not strictly ordered)

- [ ] **Export presets** — one-click TikTok / YouTube / Square (mostly redundant: the canvas size
  dropdown already offers the platform WxH options; would add named labels + 4K/4:5 resolutions).
- [ ] **Stickers** — image/emoji overlays (reuse the shape interaction + an image source).
- [ ] **Export presets (full)** — one-click TikTok / Reels / YouTube / Square (sets aspect +
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
