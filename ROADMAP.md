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

## Status: bug-hunt + UX pass + voiceover/karaoke-sync/readability complete ✅ — `npm run verify` green (95 unit + e2e + export + video + persist)

### 2026-07-02 — adversarial bug hunt (25 fixes), UX pass (18 improvements), 3 features
- **Bug fixes** (multi-agent adversarial review, all verified by direct code trace): speed-aware
  split/trim math, row-reorder undo flood, scrub-while-playing, shortcuts-during-export, caption
  wrap + line-height + font-weight preview/export parity, same-media dual-clip export seeking,
  Whisper pipeline caching, object-URL leaks, autosave restore resilience (one bad asset no longer
  nukes the project), `computeDuration` now includes overlay ends, and more (see the fix commit).
- **UX**: app-wide font + focus rings, playhead keyboard control (arrows/Home/End) + ⌘S/⌘E,
  add-at-playhead, timeline follows playback + ⌘wheel zoom-at-cursor, click-to-select on the
  preview (dbl-click text to edit), first-run hints, visible lane names + per-type overlay colors,
  scrollable inspector/dock panels, export dialog guard/duration/a11y/Escape.
- **Record voiceover** ✅ — 🎙 Record dock panel (level meter + timer), lands on an audio track at
  the playhead through the normal import path (ducking works). `src/media/recorder.ts`.
- **Speech-synced karaoke** ✅ — auto-captions now carry real per-word timings
  (`return_timestamps:'word'` + `groupWords`); pauses un-highlight; even timing stays the fallback.
- **Text readability kit** ✅ — background box (shared-measure parity), outline, shadow on text
  overlays; Inspector "Readability" section.

### Timeline row reorder + pin (executed from docs/superpowers/plans/2026-07-01-timeline-row-reorder-pin.md)
- `Project.effectOrder` (bottom-to-top paint order) + `Track.pinned`/`BaseEffect.pinned`; migrated for old docs.
- `edits.ts` maintains `effectOrder` (insert/remove/duplicate/removeMedia) + `reorderEffectRelative`/
  `reorderTrackRelative` (within-group) + `setEffectPinned`/`setTrackPinned`.
- `selectors.ts`: `getActiveEffects` iterates `effectOrder`; `timelineRows` + `partitionPinned`.
- Store `reorderRow`/`toggleRowPinned`; Timeline renders rows via `timelineRows` with a grip drag-reorder
  (⋮⋮) and a 📌 pin toggle; pinned rows sit in a sticky band. e2e step 13h covers reorder + pin.

### Timeline trimming, overlay lanes, image overlays & scroll areas (user feedback)
Spec: `docs/superpowers/specs/2026-07-01-timeline-overlays-scroll-design.md`.
- **Waveform fix** — a long audio clip showed the broken-image placeholder because the
  waveform canvas's backing store exceeded the browser's max size. `Waveform.tsx` now caps
  the intrinsic width (`MAX_WAVEFORM_PX`) and lets CSS stretch it.
- **Discoverable trimming** — trim handles are now absolutely pinned to each edge (the right
  edge previously had no real grab target) with a visible grip + tips; the Inspector
  **Duration (s)** field works for every clip kind, so you can resize a clip whose edge is
  scrolled off-screen. (Trimming was already non-destructive.)
- **Overlay timeline lanes** — one compact lane per overlay above the tracks. Drag the block
  to move it, drag an edge to retime start/end (`moveEffect`/`trimEffectStart`/`trimEffectEnd`
  reducers + `applyEffect*` drag actions). Lane order = effect insertion order (no model
  change). Selecting a block opens its Inspector.
- **Image / character overlays** — new `ImageEffect` overlay type drawn in preview (Konva) +
  export (Canvas2D) via `buildScene` (parity by construction). Added from the Elements panel's
  library-image picker; drag/resize on the preview; `removeMedia` cleans up referencing
  overlays. Round-trips through save/open (covered by e2e).
- **Scroll areas** — `ui/ScrollArea.tsx` wraps `@radix-ui/react-scroll-area` with plain-CSS
  shadcn styling; the timeline scrolls both axes (a `display:block` override keeps the sticky
  track labels working inside Radix's viewport). 
- **Test harness** — `scripts/_harness.mjs` spawns `npx` via a shell on Windows (was `ENOENT`).

## Earlier status: Phase 21 + hardening pass complete ✅

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

### Workspace refactor (user feedback)
- Moved the cramped all-in-header layout to: slim **Header** (name + Save/Open/Export/Help),
  a left **icon dock** (`ui/LeftDock.tsx`: Media/Text/Captions/Elements/Adjust/Settings panels,
  switchable + resizable), the **Preview**, a right properties **Inspector** (selected element
  only; project settings moved into the dock's Settings panel), and an **EditorBar** action row
  above the timeline (play, undo/redo, split, duplicate, delete, +tracks, snap, zoom).
- Added emoji **stickers** (`addSticker`) in the Elements panel; inline **?** help links jump to a
  feature's guide entry (`openHelp`/`HelpLink`). The whole e2e was rewired to open dock panels.

### Help & tooltips (user feedback)
- **Hover tooltips** — one global `ui/Tooltip.tsx` driven by `data-tip` attributes; a styled
  bubble appears ~1s after the pointer rests on a control. Added `data-tip` to the confusing
  controls (Transition, Snap, Motion, Speed, Duck, Frame fit, toolbar buttons, …).
- **Searchable Help** — a `?` button opens `ui/HelpDialog.tsx`: type a feature name to filter
  `help/guide.ts` entries, each with "what it is" + "how to use it". e2e step 1c covers both.

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

### Recommended next (2026-07-01 — best fit for the voice + picture + captions workflow)

- [x] **Karaoke / animated captions** ⭐ ✅ done — captions highlight each word in turn as it's
  spoken. v1 uses EVEN word timing (`captionWords`/`activeCaptionWordIndex` selectors; no speech
  data needed); auto-captions default it on; inspector toggle + highlight color. Parity via a
  shared `render/captionLayout.ts` (offscreen measure) used by both preview (Konva word nodes) and
  export (`paint.ts`). FOLLOW-UP: real speech-synced word timing (switch `transcribe.ts` to
  `return_timestamps:'word'` and store per-word timings, preferred over the even fallback).
- [x] **Slideshow builder** ✅ done — "🎞 Make slideshow" in the Media panel appends every image
  as a timed sequence on the video track (per-image seconds + Ken Burns + crossfade options), one
  undo step. Pure `buildSlideshow(p, clipIds, opts)` reducer (alternating Ken Burns; each clip
  overlaps the previous by `crossfadeFrames` → the existing overlap→dissolve makes the crossfade).
- [x] **Record voiceover** ✅ done — 🎙 Record dock panel (`media/recorder.ts` + `addRecordedVoiceover`):
  arm/level-meter/stop, recorded blob imports through the normal path, clip lands at the playhead
  on an audio track; ducking works. e2e records via a synthesized WebAudio mic.
- [x] **Text readability kit** ✅ done — background box / outline / shadow on text overlays, box
  sized by a shared `measureTextBlock` so preview + export agree. (Bundled fonts still TODO.)

### Other / lower priority

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
