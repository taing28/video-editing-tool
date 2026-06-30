# Video Editor

A browser-based, multi-track video editor — built to learn the engineering and to
own an extensible text/effects model in code. Stack: **React 19 + TypeScript +
Vite**, **Konva** for the preview, **mediabunny** (WebCodecs) for export, **Zustand**
for state, **dnd-kit** for drag/drop. No ffmpeg required.

## Run

```bash
npm install
npm run dev        # start the editor at http://localhost:5173
npm run verify     # typecheck + unit tests + browser e2e + export test (full gate)
npm run build      # typecheck + production build
```

## What works today (Phases 0–17)

- Import images / audio / **video** (Import button, or drop files on the sidebar).
- Drag a media card onto a track (or double-click to add).
- Move clips, trim either edge, split at the playhead — each gesture is one undo step.
- **Multiple tracks** — add/remove video & audio tracks (`+ Video` / `+ Audio`); upper
  video tracks composite on top.
- **Aspect-ratio / canvas presets** — 16:9, 9:16, 1:1, 4:3 (landscape, vertical, square).
- **Direct manipulation** — select an image/video/text and **drag to move, drag a corner
  to resize** right on the preview; opacity slider for media. (Writes the clip's transform;
  preview and export stay in sync.)
- **Audio waveforms** drawn on audio clips in the timeline.
- **Per-clip volume** (audio) and **fade in / fade out** (video opacity + audio gain ramps,
  applied identically in preview and export).
- **Audio ducking** — mark a music clip "duck under voice" and it auto-lowers whenever other
  (non-ducked) audio plays, so the voiceover stays clear (preview + export).
- **Speed control** — per-clip slow-mo / fast-forward (0.25×–4×) for video & audio; changing
  speed re-times the clip's length and pitches audio (preview + export).
- **Background color** for the canvas (letterbox fill for vertical/odd-ratio media).
- **Transitions** — overlap two clips on a track (drag, or the inspector's "Add transition"
  button) and the later clip transitions in with a **dissolve, wipe, or slide** style.
- **Ken Burns** — animated **pan / zoom** on a clip (zoom in/out, pan left/right) over its
  duration; frozen while you're editing the clip so you can still position it.
- **Color grading** — per-image **brightness / contrast / saturation** sliders (plus B&W and
  Vivid presets). Preview and the exported file are pixel-identical — both draw the same
  cached, CSS-filtered canvas.
- **Frame fit** — one-click **Fit** (letterbox), **Fill** (crop to fill — reframes a landscape
  photo into a vertical canvas), or **Stretch** for any image/video clip; then drag to reposition.
- **Snapping** — dragging a clip snaps its edges to other clips' edges, the playhead, and 0
  (toggle in the timeline toolbar).
- **Filmstrip thumbnails** on timeline clips (video frames sampled; images tiled) instead of
  just a name.
- **Per-track mute / hide** and **delete** controls; **delete media** from the library
  (removes its clips too, undoable).
- **Editable project name**, **frame-rate** selector, and the existing canvas/background settings.
- Scrub the ruler; Play/Pause advances the playhead — **with audible audio playback** and
  **live video frames** in the preview.
- **Video clips** decode and render frame-accurately (preview seeks; export seeks per frame).
- Add a **text overlay** (drag-positioned) or a **caption** (centered, bottom-anchored,
  outlined subtitle) with editable text / size / color / timing. An **Overlays list** in the
  inspector re-selects any text/caption.
- **Auto-captions** — transcribe the audio **on-device** (Whisper via transformers.js, no
  upload) into timed captions. The ~60 MB model is lazy-loaded only on first use.
- **Shape overlays** (rectangles / color blocks) — drag/resize on the preview; plus a one-click
  **Lower third** (bar + text). (Shapes are a 3rd effect type — the effect model is fully
  extensible.)
- **Export to a real video file** — an **export dialog** picks resolution (Full/75%/50%),
  quality (High/Medium/Low), and format (Auto/MP4/WebM); **Cancel** mid-export. H.264 MP4
  (falls back to VP9/VP8 WebM), with all audio tracks mixed down via `OfflineAudioContext`.
- **Autosave** — the project (and imported media) is saved to IndexedDB and restored on
  refresh, so you don't lose work.
- Undo/redo, keyboard shortcuts (Space, ⌘/Ctrl+Z, Delete, S to split).

**Not yet wired:** auto-transcription (Whisper) to fill the caption track; speed control;
lower-thirds / more overlay types; other transition styles; Web-Worker render.

## Testing

Browser tests run real Chromium (Playwright) and fail on any console error:

```bash
npm run test         # fast unit tests (time math, edit reducers)
npm run e2e          # editing flow: import→drag→trim→split→undo→text→scrub→play→track→aspect
npm run export:test  # exports a clip+audio, re-parses the file, checks tracks+duration
npm run video:test   # self-bootstraps an MP4, re-imports it as a video clip, preview+re-export
npm run persist:test # builds a project, reloads, asserts it restored from IndexedDB
npm run verify       # all of the above + typecheck, the canonical green gate
```

## Architecture (why it's built to scale)

Two rules carry the design:

1. **Time is integer frames** at the project's fps — never seconds/floats in the
   document. Conversions happen only at the edges. See [src/core/time.ts](src/core/time.ts).
2. **The document is pure data; rendering is a pure function of `(project, frame)`.**
   [`buildScene`](src/render/scene.ts) returns an ordered list of layers that the
   preview renders today and the export renderer will render tomorrow — so text and
   future effects appear in the export with zero special-casing.

```
src/
  core/
    time.ts          integer-frame math (+ time.test.ts)
    ids.ts           branded ids
    model.ts         Project / Track / Clip / Effect — pure serializable data
    selectors.ts     "what's visible/audible at frame N" (pure queries)
    edits.ts         move / trim / split / add / remove reducers (+ edits.test.ts)
  render/
    scene.ts         buildScene(project, frame) — the single render-path seam
    capabilities.ts  WebCodecs export feature-detection
  media/
    registry.ts      runtime drawables (kept OUT of the serializable document)
  store/
    editorStore.ts   Zustand store: document + selection + playhead + undo/redo + clock
  ui/
    Toolbar / MediaLibrary / Preview / Timeline / Inspector / App
```

## Roadmap

> Full phase checklist + how to resume work later: **[ROADMAP.md](ROADMAP.md)**.

- ~~**Phase 2 — Export**~~ ✅ done: mediabunny `CanvasSource` + a deterministic
  fake-clock loop feeding the same `buildScene`; audio mixed with `OfflineAudioContext`
  at 48 kHz; H.264/MP4 with WebM fallback. See [src/render/export.ts](src/render/export.ts).
- ~~**Phase 3 — Video clips & audio preview**~~ ✅ done: audible Web-Audio playback
  ([src/playback/audioEngine.ts](src/playback/audioEngine.ts)) + `<video>` decode/seek in
  preview and frame-accurate export. Also added multi-track + aspect presets (inspired by
  [OpenCut](https://github.com/opencut-app/opencut)).
- ~~**Phase 4 — Polish**~~ ✅ mostly done: direct-manipulation transform (move/resize on
  the preview), opacity, audio waveforms, and autosave/restore (IndexedDB).
- ~~**Phase 5 — Effects & mixing**~~ ✅ done: per-clip volume, fade in/out (video + audio),
  background color.
- ~~**Phase 6 — Transitions & snapping**~~ ✅ done.
- ~~**Phase 7 — UI & media management**~~ ✅ done: filmstrip thumbnails, per-track mute/hide,
  media delete, editable name + fps, snapping toggle.
- ~~**Phase 8 — Export controls**~~ ✅ done: resolution/quality/format dialog + cancel.
- ~~**Phase 9 — Captions**~~ ✅ done: caption effect (2nd effect type) + overlays list.
- ~~**Phase 10 — Auto-captions**~~ ✅ done: on-device Whisper transcription → timed captions.
- ~~**Phase 11 — Speed control**~~ ✅ done: per-clip 0.25×–4× for video & audio.
- ~~**Phase 12 — Shapes & lower-thirds**~~ ✅ done: rectangle effect (3rd type) + lower-third.
- ~~**Phase 13 — Transition styles**~~ ✅ done: dissolve / wipe / slide.
- ~~**Phase 14 — Ken Burns**~~ ✅ done: animated pan/zoom on clips.
- ~~**Phase 15 — Audio ducking**~~ ✅ done: auto-lower music under voice.
- ~~**Phase 16 — Color adjustments**~~ ✅ done: per-image brightness/contrast/saturation, with
  preview/export parity via one shared cached filtered canvas.
- ~~**Phase 17 — Object-fit**~~ ✅ done: Fit / Fill (cover) / Stretch reframing for visual clips.
- **Next — More:** platform export presets, stickers, color grading for video clips.
- **Later — Scale:** move render+encode into a Web Worker (note: `OfflineAudioContext` +
  `<video>` seeking are main-thread-only, so this mainly helps pure image+audio projects).
- Optional: wrap in Electron + mediabunny's server backend for native-speed export.
