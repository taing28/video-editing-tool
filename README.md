# Video Editor

A **multi-track video editor that runs entirely in your browser** — no install, no
account, and nothing is uploaded: importing, editing, transcription and export all
happen on your machine. Built from scratch with React 19, Konva and WebCodecs
(via [mediabunny](https://github.com/Vanilagy/mediabunny)); no ffmpeg.

> 🛠 Want to run or hack on the project? See **[SETUP.md](SETUP.md)**.
> 🗺 Status, history and plans live in **[ROADMAP.md](ROADMAP.md)**.

## What it does

- **Edit** — multi-track timeline (video + audio), trim / split / move with snapping,
  clip speed (0.25×–4×), dissolve/wipe/slide transitions, Ken Burns pan-zoom,
  color grading, Fit / Fill / Stretch reframing, fades.
- **Overlays** — text titles (with background box / outline / shadow for readability),
  captions with **on-device auto-transcription** and karaoke word-by-word highlight,
  shapes, lower thirds, emoji stickers, image overlays.
- **Audio** — record a **voiceover** straight into the timeline, per-clip volume and
  fades, and auto-**ducking** so music dips under your voice.
- **Output** — export a real **MP4/WebM** in the browser at your chosen resolution,
  quality and format. Work **autosaves** locally; a project (timeline + media) can also
  be saved as one portable file and reopened anywhere.

## How to use it

The first time you open the editor it offers a **guided tour** that walks every step
below by pointing at the actual buttons — replay it anytime with the **🎓 Tour** button
in the header.

Making a video, in short:

1. **Import** — open the **Media** panel (key `1`), click *Import* or drop in your
   pictures, video and audio.
2. **Build the timeline** — double-click a card to place it at the playhead, or drag it
   onto a track. Several photos? *Make slideshow* sequences them in one click.
3. **Arrange** — drag clips to move, drag their edges to trim, `S` splits at the
   playhead. Click anywhere in the timeline to seek; `Space` plays.
4. **Narrate & caption** — record a voiceover in the **Record** panel (key `2`); add
   captions by hand or *Auto-caption* the audio in the **Captions** panel (key `4`).
5. **Polish** — titles, shapes and stickers from the **Text**/**Elements** panels;
   select anything (on the preview or the timeline) and fine-tune it in the Inspector
   on the right — duration, speed, transition, motion, color, fades, volume.
6. **Export** — the **⬇ Export** button renders your MP4 (or WebM). Done.

Stuck on anything? Press `/` and search the built-in guide — every feature has a
plain-language "what it is / how to use it" entry.

## Keyboard shortcuts

Chosen to never collide with the browser's own (reserved combos like ⌘T/⌘W are
avoided; defaults like ⌘S/⌘K are intercepted so they act on the editor):

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

## Browser support

Editing works in any modern browser; **export needs WebCodecs** — use Chrome or Edge
(or Safari 26+). Auto-captions download a small speech model (~60 MB) on first use and
run fully offline afterwards.
