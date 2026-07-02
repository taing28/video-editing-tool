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

## What works today

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
- **Color grading** — **brightness / contrast / saturation** sliders (plus B&W and Vivid presets)
  on any image **or video** clip. Preview and the exported file match — both draw the same
  CSS-filtered canvas (cached for stills, re-graded per frame for video).
- **Frame fit** — one-click **Fit** (letterbox), **Fill** (crop to fill — reframes a landscape
  photo into a vertical canvas), or **Stretch** for any image/video clip; then drag to reposition.
- **Overlay fades** — text / captions / shapes can **fade in and out** (per-overlay in/out
  seconds) instead of popping, for cleaner-looking titles and subtitles.
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
  inspector re-selects any text/caption — or just **click the element on the preview**
  (double-click text to edit it).
- **Text readability kit** — a padded **background box**, **outline**, and **drop shadow**
  for text overlays, so titles read on any footage (identical in preview and export).
- **Auto-captions** — transcribe the audio **on-device** (Whisper via transformers.js, no
  upload) into timed captions. The ~60 MB model is lazy-loaded only on first use.
- **Karaoke captions** — captions can highlight each word as it's spoken; auto-captions
  carry **real speech-synced word timings** (hand-typed ones use even timing).
- **Record voiceover** — the 🎙 Record panel captures mic narration (live level meter) and
  drops it on an audio track at the playhead; music with "duck under voice" dips under it.
- **Slideshow builder** — one click turns every imported image into a timed sequence with
  optional Ken Burns motion and crossfades.
- **Image overlays** — draw any imported image on top of the video (e.g. a character
  cut-out), drag/resize on the preview, retime on its own lane.
- **Timeline rows** — every overlay gets a compact lane above the tracks; **drag a row's
  gutter to reorder it anywhere in one gesture** (the held row lifts, other groups dim,
  displaced rows slide), or 📌 pin a row into a sticky band.
- **Shape overlays** (rectangles / color blocks) — drag/resize on the preview; plus a one-click
  **Lower third** (bar + text). (Shapes are a 3rd effect type — the effect model is fully
  extensible.)
- **Export to a real video file** — an **export dialog** picks resolution (Full/75%/50%),
  quality (High/Medium/Low), and format (Auto/MP4/WebM); **Cancel** mid-export. H.264 MP4
  (falls back to VP9/VP8 WebM), with all audio tracks mixed down via `OfflineAudioContext`.
- **Autosave** — the project (and imported media) is saved to IndexedDB and restored on
  refresh, so you don't lose work.
- **Save / Open project file** — export the whole project (timeline **+ media bytes**) as one
  portable `.videoproj.json` you can back up, share, or reopen on another machine.
- **Duplicate** a clip or overlay (⧉ button / ⌘/Ctrl+D) — repeat a configured photo or title.
- **Collapsible, resizable side panels** — drag the inner edge to resize, click the ‹/› tab to
  slide a panel away; widths persist. Inspector fields wrap instead of overflowing; no scrollbars.
- **Guided tour for new users** — on your first visit the editor offers a spotlight
  walkthrough (import → arrange → overlays → voiceover → captions → export), with Next/Back on
  every step and the highlighted control explained in place. Replay it anytime with the 🎓 **Tour**
  button in the header; completion is remembered per browser (localStorage).
- **Help & tooltips** — hover any control for ~1s to get a plain-language tooltip, or click the
  **?** button for a searchable guide (what each feature is + how to use it). Inspector sections
  have inline **?** links that jump to that feature's guide entry.
- **Workspace layout** — a slim header (project name + Save/Open/Export/Help), a left **icon dock**
  (Media, Text, Captions, Elements/stickers, Adjust, Settings), the preview, a right properties
  panel, and a timeline action bar (play, split, duplicate, delete, +tracks, snap, zoom).
- Undo/redo and a full set of **keyboard shortcuts** — chosen to never collide with the
  browser's own (reserved combos like ⌘T/⌘W are avoided entirely; defaults like ⌘S/⌘K
  are intercepted so they act on the editor):

  | Keys | Action |
  | --- | --- |
  | `Space` | play / pause |
  | `←` / `→` (+`Shift`) | step 1 frame (1 second) |
  | `Home` / `End` | jump to start / end |
  | `1`–`7` | switch left-dock panels (press again to collapse) |
  | `T` / `C` | add a text overlay / a caption |
  | `/` or `⌘/Ctrl+K` | search the built-in feature guide |
  | `S` | split the selected clip at the playhead |
  | `Delete` | remove selection · `Esc` deselect |
  | `⌘/Ctrl+Z` (+`Shift`) | undo (redo) |
  | `⌘/Ctrl+D` / `⌘/Ctrl+S` / `⌘/Ctrl+E` | duplicate / save project file / export |

**Not yet wired:** bundled fonts for text, platform export presets, image/file stickers
(emoji stickers exist), Web-Worker render.

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
    time.ts          integer-frame math (+ tests)
    ids.ts           branded ids
    model.ts         Project / Track / Clip / Effect — pure serializable data
    selectors.ts     "what's visible/audible at frame N" (pure queries)
    edits.ts         move / trim / split / reorder / slideshow reducers (+ tests)
    snapping.ts      magnetic edge snapping for clip drags
  render/
    scene.ts         buildScene(project, frame) — the single render-path seam
    paint.ts         Canvas2D painter (the export side of the seam)
    export.ts        deterministic frame loop + WebCodecs encode + audio mixdown
    colorFilter.ts   shared graded-canvas cache (preview/export parity)
    captionLayout.ts shared text measurement & wrapping (parity)
    kenburns.ts      pure pan/zoom box animation
    capabilities.ts  WebCodecs export feature-detection
  playback/
    audioEngine.ts   live Web-Audio playback · audioFade.ts · duck.ts
  captions/
    transcribe.ts    on-device Whisper (word timestamps) · captions.ts
  media/
    registry.ts      runtime drawables (kept OUT of the serializable document)
    recorder.ts      microphone voiceover capture · thumbnails.ts filmstrips
  store/
    editorStore.ts   Zustand store: document + selection + playhead + undo/redo + clock
    autosave.ts      IndexedDB autosave/restore · persistence.ts · projectFile.ts · migrate.ts
  help/
    guide.ts         searchable plain-language feature guide (also feeds tooltips)
  ui/
    Header / LeftDock / MediaLibrary / Preview / Inspector / EditorBar / Timeline
    ExportDialog / HelpDialog / Tooltip / ScrollArea / Waveform / ClipFilmstrip
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
- ~~**Phase 18 — Overlay fades**~~ ✅ done: fade in/out for text / caption / shape overlays.
- ~~**Phase 19 — Video color grading**~~ ✅ done: per-frame brightness/contrast/saturation on video.
- ~~**Phase 20 — Project file save/open**~~ ✅ done: portable `.videoproj.json` (timeline + media).
- ~~**Phase 21 — Duplicate**~~ ✅ done: duplicate a clip or overlay (⌘/Ctrl+D).
- ~~**Karaoke captions**~~ ✅ done — per-word highlight, speech-synced timings from Whisper.
- ~~**Slideshow builder**~~ ✅ done — all images → timed, animated, crossfading sequence.
- ~~**Record voiceover**~~ ✅ done — in-app mic recording straight onto the timeline.
- ~~**Text readability kit**~~ ✅ done — background box / outline / shadow with export parity.
- **Next — More:** bundled fonts, platform export presets, image stickers, Web-Worker export.
- **Later — Scale:** move render+encode into a Web Worker (note: `OfflineAudioContext` +
  `<video>` seeking are main-thread-only, so this mainly helps pure image+audio projects).
- Optional: wrap in Electron + mediabunny's server backend for native-speed export.
