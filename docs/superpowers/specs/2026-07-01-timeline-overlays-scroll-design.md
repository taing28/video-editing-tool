# Timeline trimming + overlay lanes + image overlays + scroll areas

**Date:** 2026-07-01
**Status:** Approved — ready for implementation
**Branch:** `feature/timeline-overlays-scroll`

## Goal

Five related improvements to the timeline / overlay editing experience, driven by
user feedback. Two of the originally-requested capabilities (drag-to-trim and
non-destructive recovery) already exist in code; the real gaps are discoverability,
overlay timing control, image overlays, a long-audio waveform bug, and scrollbars.

## Golden rules (must not break)

1. Time is integer frames at the project fps — never seconds/floats in the document.
2. `buildScene(project, frame)` is the single render path — new visuals must appear in
   the export automatically (preview + export parity).
3. Keep `npm run verify` green (typecheck + unit + e2e + export + video + persist).

## Parts (build order: A → B → E → C → D)

### Part A — Fix the long-audio waveform bug

**Symptom:** a long audio clip shows the browser's broken-image placeholder instead of
a waveform.

**Root cause:** `Waveform.tsx` sets `canvas.width = clip.durationInFrames * pxPerFrame`
with no cap. For a long clip (e.g. ~695 s → ~60,000 px) this exceeds the browser's max
canvas backing-store size, allocation fails, and the canvas renders the broken-image icon.
The short clips work because they stay under the limit.

**Fix:** cap the canvas's intrinsic width at `MAX_WAVEFORM_PX` (≈ 4096). The existing CSS
`.waveform { width: 100% }` already stretches the canvas to the clip's display width, so a
capped backing store just means a slightly lower-res waveform on very long clips — correct
instead of broken. Bins derive from the capped width.

**Files:** `src/ui/Waveform.tsx`.
**Verify:** build + manual (load a long audio clip → waveform renders). No model change.

### Part B — Make trimming discoverable & reachable

The trim/recover behavior already exists (`trimClipStart`/`trimClipEnd` in `edits.ts`);
it's just hard to find and unreachable when a clip's edge is off-screen.

1. **Bigger, clearer trim handles** — widen from 8 px, add a visible grip and a
   lighter hover / brighter-when-selected state, plus `data-tip`
   ("Drag to trim — drag back out to restore"). (`Timeline.tsx`, `App.css`)
2. **Inspector "Duration (s)" field** for the selected clip — resize a clip whose edge
   is off-screen without scrolling to it. Wired to the existing `setClipDuration`
   reducer. (`Inspector.tsx`)
3. Trimming stays fully non-destructive (already true — no change needed).

**Files:** `src/ui/Timeline.tsx`, `src/App.css`, `src/ui/Inspector.tsx`.
**Verify:** e2e step (drag handle resizes; duration field resizes).

### Part E — Scroll areas (Radix + shadcn-style, plain CSS)

The app deliberately hid native scrollbars app-wide; the timeline is about to grow both
wide (long clips) and tall (one lane per overlay), so it needs good scrollbars.

- Add `@radix-ui/react-scroll-area`.
- Create reusable `src/ui/ScrollArea.tsx` wrapping Radix primitives
  (Root / Viewport / Scrollbar / Thumb / Corner), styled with **plain CSS** (no Tailwind)
  to match shadcn's look: thin track, rounded thumb, fade-in on hover, both orientations.
- Apply to the timeline scroll container first (horizontal + vertical), then the side
  panels (LeftDock / Inspector / Sidebar). Remove the "hide scrollbars" CSS where used.

**Integration risk:** Radix's `Viewport` wraps content in a `display:table` div. The
timeline uses a sticky label gutter, absolutely-positioned clip blocks, and a playhead
overlay. Verify these still lay out correctly inside the viewport; if they conflict, fall
back to styling Radix's scrollbar over the existing `.timeline__scroll` container without
Radix's viewport wrapper.

**Files:** new `src/ui/ScrollArea.tsx`, `src/ui/Timeline.tsx`, `src/index.css`,
side-panel components.
**Verify:** build + manual (timeline scrolls both axes with styled bar).

### Part C — Overlay timeline lanes (one row per overlay)

Effects already carry independent `timing: {start, duration}` but are not drawn on the
timeline. Add one compact lane per overlay so its start/end can be set visually.

- **Model:** add `effectOrder: EffectId[]` to `Project` for stable lane order; migrate
  existing projects (default to `Object.keys(effects)`). New effects append their id.
  (`model.ts`, `migrate.ts`, and `projectFile.ts` round-trip)
- **Pure reducers** in `edits.ts`: `moveEffect(p, id, newStart)`,
  `trimEffectStart(p, id, newStart)`, `trimEffectEnd(p, id, newEnd)` operating on
  `effect.timing` (mirror the clip trim reducers; duration ≥ 1, start ≥ 0).
- **Store actions** mirroring the clip drag (`applyEffectMove` / `applyEffectTrimStart` /
  `applyEffectTrimEnd`) using the begin-interaction snapshot pattern.
- **Timeline UI:** render one lane per effect (in `effectOrder`) **above the Video lane**
  (overlays draw on top). Each lane shows the overlay as a draggable block at
  `timing.start`, width `timing.duration`, reusing the `ClipBlock` move + trim gesture.
  Label = type + snippet (text / 😀 / "Shape" / image name); ✕ deletes; selecting sets
  `selectedEffectId` → existing Inspector. Lanes are thinner (~28 px); rely on the
  timeline scroll (Part E) for height. Collapse-all is deferred (YAGNI).
- **Render untouched** — `scene.ts` already renders effects by timing; we only add a
  timing editor.

**Files:** `src/core/model.ts`, `src/core/edits.ts`, `src/store/editorStore.ts`,
`src/store/migrate.ts`, `src/ui/Timeline.tsx`, `src/App.css`.
**Verify:** unit tests for `moveEffect`/`trimEffectStart`/`trimEffectEnd`; e2e step
(drag an overlay lane changes its timing).

### Part D — Image / character overlays

- **New effect variant** `ImageEffect` (`type:'image'`, `mediaId: MediaId`,
  `x/y/width/height`, `opacity`) added to the `Effect` union. (`model.ts`)
- **Renderer:** draw it in both paths — Konva `<KonvaImage>` in `Preview.tsx`, and
  `ctx.drawImage` in the export's `buildScene` (`scene.ts`/`paint.ts`) — honoring
  `timing` and fade opacity, reusing the shape's drag/resize box interaction.
- **Add flow:** an "🖼 Image" control in the Elements panel that lists the project's
  imported **image** assets; clicking one inserts an `ImageEffect` at the playhead with a
  contained box. New images still arrive through the existing Import. (`LeftDock.tsx`,
  `editorStore.ts`)
- **Correctness fix:** `disposeUnusedMedia(keep)` (media registry, from the hardening
  pass) currently computes `keep` from clips only — it must also include
  `effect.mediaId` for image effects, or overlay images get wrongly released on
  load/new. (`registry.ts` + caller)
- **Persistence:** project save/open already bundles media bytes; an image overlay that
  references a media asset survives the round-trip. Add an e2e assertion.

**Files:** `src/core/model.ts`, `src/render/scene.ts`, `src/render/paint.ts`,
`src/ui/Preview.tsx`, `src/ui/LeftDock.tsx`, `src/store/editorStore.ts`,
`src/media/registry.ts`, `src/store/projectFile.ts`.
**Verify:** unit test (image effect in scene), e2e step (add image overlay; survives
save/open).

## Decisions (locked)

- Overlay layout: **one row per overlay** (not a shared lane).
- Trim reachability: **Inspector Duration field** (not zoom-to-fit).
- Image overlay source: **project library images** (Import adds new ones).
- Scroll area: **Radix primitive + plain-CSS shadcn styling** (no Tailwind).

## Out of scope (deferred)

- Collapse-all / grouping for overlay lanes.
- Reordering overlay lanes by drag (the `effectOrder` array makes it possible later).
- Per-overlay hide toggle.
- Animated/video character overlays (image overlays are static).
