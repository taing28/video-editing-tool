# Timeline Row Reorder + Pin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user drag timeline rows to reorder them (within their group) and pin rows so they stay stuck at the top of the timeline while everything else scrolls under them.

**Architecture:** Add an explicit `effectOrder` array to the document (overlays currently rely on object insertion order) plus a `pinned` flag on tracks and effects. A single `timelineRows()` selector derives the ordered, pinned-partitioned row list that both the timeline UI and overlay compositing consume. Reordering is a hand-rolled vertical pointer-drag on a lane grip (mirroring the existing clip/overlay drag pattern) that calls pure `reorder*Relative` reducers. Pinned rows render in a CSS `position: sticky` band at the top of the existing Radix scroll viewport.

**Tech Stack:** React 19, TypeScript, Zustand, plain CSS. No new dependencies. Tests: Vitest (unit) + Playwright (`scripts/e2e.mjs`).

## Global Constraints

- Time is integer frames at the project fps — never seconds/floats in the document.
- `buildScene(project, frame)` is the single render path — preview and export must agree.
- Keep `npm run verify` green (typecheck + 60 unit + e2e + export + video + persist).
- Reordering is **within a group only**: overlays reorder among overlays; video tracks among video tracks; audio tracks among audio tracks. Overlays always composite above clips (renderer structure unchanged).
- **Z-order rule (do not break existing stacking):** `effectOrder` is **bottom-to-top paint order** (index 0 paints first = visually behind), identical to today's `Object.values(effects)` order — so existing overlays and lower-thirds keep their stacking. The timeline shows overlay lanes in **reverse** `effectOrder` (topmost lane = topmost layer, matching the track lanes). New overlays append to `effectOrder` and therefore appear as the **top** overlay lane.
- Track convention (already in code, keep it): `trackOrder` index 0 = top lane = top layer; `getActiveVideoClips` paints reverse so the top lane lands on top.
- Reordering operates on the full order array but the UI only ever drags an **unpinned** row relative to another **unpinned** row, so pinned rows keep their array positions automatically.

---

## File Structure

- `src/core/model.ts` — add `effectOrder: EffectId[]` to `Project`; add `pinned?: boolean` to `Track` and `BaseEffect`; `createEmptyProject` seeds `effectOrder: []`.
- `src/store/migrate.ts` — default `effectOrder` for older documents.
- `src/core/edits.ts` — maintain `effectOrder` in `insertEffect`/`removeEffect`/`duplicateEffect`/`removeMedia`; add `reorderEffectRelative`, `reorderTrackRelative`, `setEffectPinned`, `setTrackPinned`.
- `src/core/selectors.ts` — `getActiveEffects` iterates `effectOrder`; add `timelineRows` + `partitionPinned` + the `TimelineRow` type.
- `src/store/editorStore.ts` — actions `reorderRow`, `toggleRowPinned`; expose them.
- `src/ui/Timeline.tsx` — render rows via `timelineRows`, sticky pinned band, a grip drag-handle per lane wired to a hand-rolled vertical reorder.
- `src/App.css` — grip + pinned-band + pin-button styles.
- `scripts/e2e.mjs` — steps that reorder an overlay lane and pin a row.

---

## Task 1: Model fields + migration (`effectOrder`, `pinned`)

**Files:**
- Modify: `src/core/model.ts` (the `Track` interface, `BaseEffect` interface, `Project` interface, `createEmptyProject`)
- Modify: `src/store/migrate.ts:8-26`
- Test: `src/store/migrate.test.ts` (create)

**Interfaces:**
- Produces: `Project.effectOrder: EffectId[]`; `Track.pinned?: boolean`; `BaseEffect.pinned?: boolean`; `migrateProject` defaults `effectOrder`.

- [ ] **Step 1: Add the model fields.** In `src/core/model.ts`:

In `interface Track` add after `hidden: boolean;`:
```ts
  /** Keep this lane stuck at the top of the timeline. */
  pinned?: boolean;
```
In `interface BaseEffect` add after the `timing` field:
```ts
  /** Keep this overlay's lane stuck at the top of the timeline. */
  pinned?: boolean;
```
In `interface Project` add after `effects: Record<string, Effect>;`:
```ts
  /** Overlay lane order, bottom-to-top paint order (index 0 paints first). */
  effectOrder: EffectId[];
```
In `createEmptyProject`'s returned object add after `effects: {},`:
```ts
    effectOrder: [],
```

- [ ] **Step 2: Write the failing migration test.** Create `src/store/migrate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { migrateProject } from './migrate';
import type { Project } from '../core/model';

describe('migrateProject — effectOrder', () => {
  it('defaults effectOrder to the effect ids when missing', () => {
    const legacy = {
      clips: {},
      effects: { a: { id: 'a' }, b: { id: 'b' } },
    } as unknown as Project;
    const out = migrateProject(legacy);
    expect(out.effectOrder).toEqual(['a', 'b']);
  });

  it('leaves an existing effectOrder untouched', () => {
    const p = { clips: {}, effects: { a: {}, b: {} }, effectOrder: ['b', 'a'] } as unknown as Project;
    expect(migrateProject(p).effectOrder).toEqual(['b', 'a']);
  });
});
```

- [ ] **Step 3: Run it to verify it fails.**
Run: `npx vitest run src/store/migrate.test.ts`
Expected: FAIL (`effectOrder` is `undefined`).

- [ ] **Step 4: Implement the migration.** In `src/store/migrate.ts`, before `return project;`:
```ts
  if (!Array.isArray((project as { effectOrder?: unknown }).effectOrder)) {
    project.effectOrder = Object.keys(project.effects);
  }
```

- [ ] **Step 5: Run tests to verify they pass.**
Run: `npx vitest run src/store/migrate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck.**
Run: `npm run typecheck`
Expected: PASS (tsc reports nothing). If it complains that `effectOrder` is missing in a `Project` literal somewhere, add `effectOrder: []` there — but `createEmptyProject` is the only literal.

- [ ] **Step 7: Commit.**
```bash
git add src/core/model.ts src/store/migrate.ts src/store/migrate.test.ts
git commit -m "model: add effectOrder + pinned flags (+migration)"
```

---

## Task 2: Maintain `effectOrder` in the edit reducers

**Files:**
- Modify: `src/core/edits.ts` (`insertEffect`, `removeEffect`, `duplicateEffect`, `removeMedia`)
- Test: `src/core/edits.test.ts` (append)

**Interfaces:**
- Consumes: `Project.effectOrder` (Task 1).
- Produces: `insertEffect` appends to `effectOrder`; `removeEffect` and `removeMedia` prune it; `duplicateEffect` inserts the new id right after the original.

- [ ] **Step 1: Write the failing tests.** Append to `src/core/edits.test.ts` (inside the existing top-level describe block area, after the `removeMedia` describe):
```ts
describe('effectOrder maintenance', () => {
  const txt = (id: string) =>
    ({
      id,
      type: 'text',
      timing: { start: 0, duration: 30 },
      text: 't',
      fontSize: 40,
      fontWeight: 700,
      fontFamily: 'sans',
      color: '#fff',
      x: 0,
      y: 0,
      align: 'left',
    }) as unknown as Effect;

  it('insertEffect appends, removeEffect prunes', () => {
    let p = createEmptyProject({ fps: 30 });
    p = insertEffect(p, txt('a'));
    p = insertEffect(p, txt('b'));
    expect(p.effectOrder).toEqual(['a', 'b']);
    p = removeEffect(p, 'a' as unknown as Parameters<typeof removeEffect>[1]);
    expect(p.effectOrder).toEqual(['b']);
  });

  it('duplicateEffect inserts the copy right after the original', () => {
    let p = createEmptyProject({ fps: 30 });
    p = insertEffect(p, txt('a'));
    p = insertEffect(p, txt('b'));
    p = duplicateEffect(p, 'a' as unknown as Parameters<typeof duplicateEffect>[1], 'a2' as unknown as Parameters<typeof duplicateEffect>[2]);
    expect(p.effectOrder).toEqual(['a', 'a2', 'b']);
  });
});
```
Add `removeEffect` and `duplicateEffect` to the existing `from './edits'` import in this file.

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/core/edits.test.ts`
Expected: FAIL (`effectOrder` not maintained — `insertEffect` leaves it `[]`).

- [ ] **Step 3: Implement maintenance.** In `src/core/edits.ts`:

`insertEffect` — replace its body:
```ts
export function insertEffect(p: Project, effect: Effect): Project {
  return {
    ...p,
    effects: { ...p.effects, [effect.id]: effect },
    effectOrder: [...p.effectOrder, effect.id],
  };
}
```
`removeEffect` — replace its body:
```ts
export function removeEffect(p: Project, effectId: EffectId): Project {
  if (!p.effects[effectId]) return p;
  const effects = { ...p.effects };
  delete effects[effectId];
  return { ...p, effects, effectOrder: p.effectOrder.filter((id) => id !== effectId) };
}
```
`duplicateEffect` — change the final `return` so the copy lands right after the original in `effectOrder`:
```ts
  const i = p.effectOrder.indexOf(effectId);
  const effectOrder =
    i < 0
      ? [...p.effectOrder, newId]
      : [...p.effectOrder.slice(0, i + 1), newId, ...p.effectOrder.slice(i + 1)];
  return { ...p, effects: { ...p.effects, [newId]: copy }, effectOrder };
```
`removeMedia` — in the block that prunes image effects, also prune `effectOrder`. Replace the closing of that function:
```ts
  const effects = { ...p.effects };
  const removedEffectIds: string[] = [];
  for (const eff of Object.values(p.effects)) {
    if (eff.type === 'image' && eff.mediaId === mediaId) {
      delete effects[eff.id];
      removedEffectIds.push(eff.id);
    }
  }
  const effectOrder = p.effectOrder.filter((id) => !removedEffectIds.includes(id));
  return recompute({ ...p, media, clips, tracks, effects, effectOrder });
```

- [ ] **Step 4: Run tests to verify they pass.**
Run: `npx vitest run src/core/edits.test.ts`
Expected: PASS (all existing + 2 new).

- [ ] **Step 5: Commit.**
```bash
git add src/core/edits.ts src/core/edits.test.ts
git commit -m "edits: maintain effectOrder on insert/remove/duplicate/removeMedia"
```

---

## Task 3: `getActiveEffects` via `effectOrder` + `timelineRows` selector

**Files:**
- Modify: `src/core/selectors.ts` (`getActiveEffects`; add `TimelineRow`, `timelineRows`, `partitionPinned`)
- Test: `src/core/selectors.test.ts` (create)

**Interfaces:**
- Consumes: `Project.effectOrder`, `Track.pinned`, `Effect.pinned`.
- Produces:
  - `getActiveEffects(p, frame): Effect[]` iterating `effectOrder` (bottom-to-top paint order).
  - `type TimelineRow = { type: 'overlay'; id: EffectId; pinned: boolean } | { type: 'track'; id: TrackId; kind: TrackKind; pinned: boolean }`
  - `timelineRows(p): TimelineRow[]` — top-to-bottom display order: overlays (reverse `effectOrder`), then tracks (in `trackOrder`).
  - `partitionPinned(rows): { pinned: TimelineRow[]; scrolling: TimelineRow[] }`

- [ ] **Step 1: Write the failing tests.** Create `src/core/selectors.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createEmptyProject } from './model';
import type { Effect, Project } from './model';
import { insertEffect } from './edits';
import { newEffectId } from './ids';
import { getActiveEffects, timelineRows, partitionPinned } from './selectors';

function withTwoOverlays(): { p: Project; a: string; b: string } {
  let p = createEmptyProject({ fps: 30 });
  const a = newEffectId();
  const b = newEffectId();
  const mk = (id: string) =>
    ({ id, type: 'shape', timing: { start: 0, duration: 100 }, x: 0, y: 0, width: 10, height: 10, color: '#fff', opacity: 1 }) as unknown as Effect;
  p = insertEffect(p, mk(a));
  p = insertEffect(p, mk(b));
  return { p, a, b };
}

describe('getActiveEffects order', () => {
  it('returns active effects in effectOrder (bottom-to-top paint order)', () => {
    const { p, a, b } = withTwoOverlays();
    expect(getActiveEffects(p, 10).map((e) => e.id)).toEqual([a, b]);
  });
});

describe('timelineRows', () => {
  it('lists overlays (top lane = last in effectOrder) then tracks', () => {
    const { p, a, b } = withTwoOverlays();
    const rows = timelineRows(p);
    // top lane first: b (appended last) is the topmost overlay lane
    expect(rows.slice(0, 2)).toEqual([
      { type: 'overlay', id: b, pinned: false },
      { type: 'overlay', id: a, pinned: false },
    ]);
    expect(rows.filter((r) => r.type === 'track').map((r) => r.type)).toEqual(['track', 'track']);
  });

  it('partitionPinned splits pinned rows out while preserving order', () => {
    const { p, a } = withTwoOverlays();
    p.effects[a].pinned = true;
    const { pinned, scrolling } = partitionPinned(timelineRows(p));
    expect(pinned.map((r) => 'id' in r && r.id)).toContain(a);
    expect(scrolling.some((r) => 'id' in r && r.id === a)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/core/selectors.test.ts`
Expected: FAIL (`timelineRows`/`partitionPinned` not exported).

- [ ] **Step 3: Implement.** In `src/core/selectors.ts`:

Replace `getActiveEffects`:
```ts
/** Global timed overlays active at `frame`, in effectOrder (bottom-to-top paint order). */
export function getActiveEffects(p: Project, frame: Frames): Effect[] {
  const out: Effect[] = [];
  for (const id of p.effectOrder) {
    const e = p.effects[id];
    if (e && rangeContains(e.timing, frame)) out.push(e);
  }
  return out;
}
```
Add the imports `TrackKind` and `EffectId` to the existing type imports at the top:
```ts
import type { Project, Track, Clip, VideoClip, AudioClip, Effect, TrackKind } from './model';
import type { ClipId, TrackId, EffectId } from './ids';
```
Append at the end of the file:
```ts
export type TimelineRow =
  | { type: 'overlay'; id: EffectId; pinned: boolean }
  | { type: 'track'; id: TrackId; kind: TrackKind; pinned: boolean };

/** Display order, top-to-bottom: overlays (top lane = last in effectOrder), then tracks. */
export function timelineRows(p: Project): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (let i = p.effectOrder.length - 1; i >= 0; i--) {
    const e = p.effects[p.effectOrder[i]];
    if (e) rows.push({ type: 'overlay', id: e.id, pinned: !!e.pinned });
  }
  for (const t of getTracksInOrder(p)) {
    rows.push({ type: 'track', id: t.id, kind: t.kind, pinned: !!t.pinned });
  }
  return rows;
}

/** Split rows into the sticky pinned band and the scrolling remainder (order kept). */
export function partitionPinned(rows: TimelineRow[]): {
  pinned: TimelineRow[];
  scrolling: TimelineRow[];
} {
  return { pinned: rows.filter((r) => r.pinned), scrolling: rows.filter((r) => !r.pinned) };
}
```

- [ ] **Step 4: Run all unit tests.**
Run: `npm test`
Expected: PASS (existing 62 + new). `getActiveEffects` direction is unchanged (still bottom-to-top), so scene/buildScene tests stay green.

- [ ] **Step 5: Commit.**
```bash
git add src/core/selectors.ts src/core/selectors.test.ts
git commit -m "selectors: effectOrder-driven getActiveEffects + timelineRows/partitionPinned"
```

---

## Task 4: Reorder + pin reducers

**Files:**
- Modify: `src/core/edits.ts` (add four reducers + one private helper)
- Test: `src/core/edits.test.ts` (append)

**Interfaces:**
- Produces:
  - `reorderEffectRelative(p, id, targetId, place: 'before' | 'after'): Project` — moves `id` adjacent to `targetId` in `effectOrder`.
  - `reorderTrackRelative(p, id, targetId, place): Project` — same on `trackOrder`, **no-op if the two tracks are different kinds**.
  - `setEffectPinned(p, id, pinned): Project`
  - `setTrackPinned(p, id, pinned): Project`

- [ ] **Step 1: Write the failing tests.** Append to `src/core/edits.test.ts`:
```ts
describe('reorder + pin reducers', () => {
  function order(arr: string[]) {
    return arr; // readability helper
  }
  it('reorderEffectRelative moves an id before/after a target', () => {
    let p = createEmptyProject({ fps: 30 });
    p = { ...p, effectOrder: order(['a', 'b', 'c']) };
    expect(reorderEffectRelative(p, 'c' as never, 'a' as never, 'before').effectOrder).toEqual(['c', 'a', 'b']);
    expect(reorderEffectRelative(p, 'a' as never, 'c' as never, 'after').effectOrder).toEqual(['b', 'c', 'a']);
  });

  it('reorderTrackRelative only moves within the same track kind', () => {
    let p = createEmptyProject({ fps: 30 }); // trackOrder = [video, audio]
    const [video, audio] = p.trackOrder;
    // different kinds → no-op (returns the same object)
    expect(reorderTrackRelative(p, video as never, audio as never, 'before')).toBe(p);
  });

  it('setEffectPinned / setTrackPinned toggle the flag', () => {
    let p = createEmptyProject({ fps: 30 });
    const track = p.trackOrder[0];
    expect(setTrackPinned(p, track as never, true).tracks[track].pinned).toBe(true);
  });
});
```
Add `reorderEffectRelative, reorderTrackRelative, setEffectPinned, setTrackPinned` to the `from './edits'` import.

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/core/edits.test.ts`
Expected: FAIL (reducers not exported).

- [ ] **Step 3: Implement.** In `src/core/edits.ts`, in the effects/overlay section:
```ts
/** Move `id` so it sits immediately before/after `targetId` in an order array. */
function reposition(order: string[], id: string, targetId: string, place: 'before' | 'after'): string[] {
  if (id === targetId) return order;
  const without = order.filter((x) => x !== id);
  const ti = without.indexOf(targetId);
  if (ti < 0) return order;
  const at = place === 'before' ? ti : ti + 1;
  return [...without.slice(0, at), id, ...without.slice(at)];
}

export function reorderEffectRelative(
  p: Project,
  id: EffectId,
  targetId: EffectId,
  place: 'before' | 'after',
): Project {
  const next = reposition(p.effectOrder, id, targetId, place);
  if (next === p.effectOrder) return p;
  return { ...p, effectOrder: next };
}

export function reorderTrackRelative(
  p: Project,
  id: TrackId,
  targetId: TrackId,
  place: 'before' | 'after',
): Project {
  const a = p.tracks[id];
  const b = p.tracks[targetId];
  if (!a || !b || a.kind !== b.kind) return p; // within-kind only
  const next = reposition(p.trackOrder, id, targetId, place);
  if (next === p.trackOrder) return p;
  return { ...p, trackOrder: next };
}

export function setEffectPinned(p: Project, id: EffectId, pinned: boolean): Project {
  const e = p.effects[id];
  if (!e || !!e.pinned === pinned) return p;
  return { ...p, effects: { ...p.effects, [id]: { ...e, pinned } } };
}

export function setTrackPinned(p: Project, id: TrackId, pinned: boolean): Project {
  const t = p.tracks[id];
  if (!t || !!t.pinned === pinned) return p;
  return { ...p, tracks: { ...p.tracks, [id]: { ...t, pinned } } };
}
```

- [ ] **Step 4: Run tests to verify they pass.**
Run: `npx vitest run src/core/edits.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/core/edits.ts src/core/edits.test.ts
git commit -m "edits: reorder (within-group) + pin reducers"
```

---

## Task 5: Store actions (`reorderRow`, `toggleRowPinned`)

**Files:**
- Modify: `src/store/editorStore.ts` (imports, `EditorState` interface, action impls)

**Interfaces:**
- Consumes: `reorderEffectRelative`, `reorderTrackRelative`, `setEffectPinned`, `setTrackPinned`, `TimelineRow`.
- Produces on the store:
  - `reorderRow(row: TimelineRow, targetId: string, displayPlace: 'above' | 'below'): void`
  - `toggleRowPinned(row: TimelineRow): void`
  - `beginInteraction()` is reused so a drag is one undo step (already exists).

- [ ] **Step 1: Add imports.** In `src/store/editorStore.ts`, add to the `from '../core/edits'` import:
```ts
  reorderEffectRelative as reorderEffectRelativeEdit,
  reorderTrackRelative as reorderTrackRelativeEdit,
  setEffectPinned as setEffectPinnedEdit,
  setTrackPinned as setTrackPinnedEdit,
```
And add to the `from '../core/selectors'` import (currently `import { computeDuration } from '../core/selectors';`):
```ts
import { computeDuration, type TimelineRow } from '../core/selectors';
```

- [ ] **Step 2: Declare the actions** in `interface EditorState`, after `toggleTrackHidden`:
```ts
  /** Move a row before/after a sibling of the same group (overlay/track). */
  reorderRow: (row: TimelineRow, targetId: string, displayPlace: 'above' | 'below') => void;
  /** Pin/unpin a row so it sticks to the top of the timeline. */
  toggleRowPinned: (row: TimelineRow) => void;
```

- [ ] **Step 3: Implement the actions** near the other `commit`-based actions (e.g. after `toggleTrackHidden`):
```ts
    reorderRow: (row, targetId, displayPlace) => {
      if (row.id === targetId) return;
      if (row.type === 'overlay') {
        // Overlay lanes are shown in REVERSE effectOrder, so "above in display"
        // means "later in effectOrder" (more on top) → 'after'.
        const place = displayPlace === 'above' ? 'after' : 'before';
        commit((p) => reorderEffectRelativeEdit(p, row.id as never, targetId as never, place));
      } else {
        // Track lanes are shown in trackOrder forward; "above" = earlier = 'before'.
        const place = displayPlace === 'above' ? 'before' : 'after';
        commit((p) => reorderTrackRelativeEdit(p, row.id as never, targetId as never, place));
      }
    },

    toggleRowPinned: (row) => {
      if (row.type === 'overlay') {
        commit((p) => setEffectPinnedEdit(p, row.id as never, !row.pinned));
      } else {
        commit((p) => setTrackPinnedEdit(p, row.id as never, !row.pinned));
      }
    },
```
(The `as never` casts bridge the branded `EffectId`/`TrackId` id types from the plain `string` on `TimelineRow`; they are safe because the reducers re-validate by lookup.)

- [ ] **Step 4: Typecheck.**
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/store/editorStore.ts
git commit -m "store: reorderRow + toggleRowPinned actions"
```

---

## Task 6: Timeline UI — render rows via `timelineRows` + grip drag-reorder

**Files:**
- Modify: `src/ui/Timeline.tsx`

**Interfaces:**
- Consumes: `timelineRows`, `partitionPinned`, `TimelineRow`, `reorderRow`, `toggleRowPinned`.
- Produces: a `<LaneRow>` wrapper that renders either an `OverlayLane` or a `TrackLane`, with a grip that drives reordering; pinned rows render in a sticky band.

This task has no isolated unit test (it's interactive DOM); it is verified by the e2e in Task 8 and by `npm run build`. Keep each step small and build after.

- [ ] **Step 1: Import the selectors + actions.** In `src/ui/Timeline.tsx` update the selectors import:
```ts
import { getTracksInOrder, getTrackClips, timelineRows, partitionPinned } from '../core/selectors';
import type { TimelineRow } from '../core/selectors';
```

- [ ] **Step 2: Add a module-level reorder-drag helper hook.** Add near the top of `Timeline.tsx` (after the imports):
```ts
/**
 * Hand-rolled vertical reorder drag, mirroring the clip/overlay drag pattern.
 * The grip's onPointerDown starts it; while dragging, the row under the pointer
 * (matched by the data-row-id of `.lane` elements in the same group) becomes the
 * drop target. One gesture = one undo step.
 */
function useRowReorder(row: TimelineRow) {
  const reorderRow = useEditor((s) => s.reorderRow);
  const beginInteraction = useEditor((s) => s.beginInteraction);
  const dragging = useRef(false);
  const started = useRef(false);

  const onGripDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragging.current = true;
    started.current = false;
  };

  const onGripMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const el = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((n) => (n as HTMLElement).classList?.contains('lane')) as HTMLElement | undefined;
    const targetId = el?.dataset.rowId;
    const targetKind = el?.dataset.rowGroup;
    if (!targetId || targetId === row.id) return;
    // same group only (overlay / video / audio)
    const myGroup = row.type === 'overlay' ? 'overlay' : row.kind;
    if (targetKind !== myGroup) return;
    if (!started.current) {
      started.current = true;
      beginInteraction();
    }
    const r = el!.getBoundingClientRect();
    const place = e.clientY < r.top + r.height / 2 ? 'above' : 'below';
    reorderRow(row, targetId, place);
  };

  const onGripUp = (e: React.PointerEvent) => {
    if (dragging.current) (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragging.current = false;
  };

  return { onGripDown, onGripMove, onGripUp };
}
```
Note: `useRef`, `React` are already imported in this file (`import { memo, useRef } from 'react'`; add `import type React from 'react'` is unnecessary — `React.PointerEvent` already resolves via the existing JSX runtime; if tsc complains, add `import { type PointerEvent } from 'react'` and use `PointerEvent`).

- [ ] **Step 3: Add the grip + pin button to `TrackLane`'s label.** In `TrackLane`, change the `lane` wrapper to carry data attributes and add a grip + pin button. Replace the opening of the returned JSX:
```tsx
  const toggleRowPinned = useEditor((s) => s.toggleRowPinned);
  const grip = useRowReorder({ type: 'track', id: track.id, kind: track.kind, pinned: !!track.pinned });
  return (
    <div
      className={`lane lane--${track.kind}${track.hidden ? ' is-hidden' : ''}`}
      data-row-id={track.id}
      data-row-group={track.kind}
    >
      <div className="lane__label">
        <span
          className="lane__grip"
          title="Drag to reorder"
          onPointerDown={grip.onGripDown}
          onPointerMove={grip.onGripMove}
          onPointerUp={grip.onGripUp}
        >
          ⋮⋮
        </span>
        <span className="lane__name">{track.name}</span>
        <div className="lane__controls">
          <button
            className={`lane__toggle${track.pinned ? ' is-on' : ''}`}
            title={track.pinned ? 'Unpin row' : 'Pin row to top'}
            aria-label={track.pinned ? 'Unpin row' : 'Pin row to top'}
            aria-pressed={!!track.pinned}
            onClick={() => toggleRowPinned({ type: 'track', id: track.id, kind: track.kind, pinned: !!track.pinned })}
          >
            📌
          </button>
```
(Leave the rest of `lane__controls` — the existing mute/hide + delete buttons — unchanged, just inserted after this new pin button.)

- [ ] **Step 4: Add the grip + pin button to `OverlayLane`'s label.** In `OverlayLane`, add:
```tsx
  const toggleRowPinned = useEditor((s) => s.toggleRowPinned);
  const grip = useRowReorder({ type: 'overlay', id: effect.id, pinned: !!effect.pinned });
```
and change its wrapper + label:
```tsx
  return (
    <div
      className={`lane lane--overlay${selected ? ' is-active' : ''}`}
      data-row-id={effect.id}
      data-row-group="overlay"
    >
      <div className="lane__label">
        <span
          className="lane__grip"
          title="Drag to reorder"
          onPointerDown={grip.onGripDown}
          onPointerMove={grip.onGripMove}
          onPointerUp={grip.onGripUp}
        >
          ⋮⋮
        </span>
        <span className="lane__name" title={overlayLabel(effect, media?.name)}>
          <span className="lane__ico">{overlayIcon(effect)}</span>
          {overlayLabel(effect, media?.name)}
        </span>
        <div className="lane__controls">
          <button
            className={`lane__toggle${effect.pinned ? ' is-on' : ''}`}
            title={effect.pinned ? 'Unpin row' : 'Pin row to top'}
            aria-label={effect.pinned ? 'Unpin row' : 'Pin row to top'}
            aria-pressed={!!effect.pinned}
            onClick={() => toggleRowPinned({ type: 'overlay', id: effect.id, pinned: !!effect.pinned })}
          >
            📌
          </button>
          <button
            className="lane__delete"
            title="Delete overlay"
            aria-label="Delete overlay"
            onClick={() => removeEffect(effect.id)}
          >
            ✕
          </button>
        </div>
      </div>
```
(Keep the existing `lane__area` + `OverlayBlock` below unchanged. `OverlayLane` needs the `effect.pinned` field — already on the model.)

- [ ] **Step 5: Render rows from `timelineRows`, with a sticky pinned band.** In the `Timeline` component, replace the row-rendering block (the `overlays.map(...)` + `tracks.map(...)` lines) with a single ordered, partitioned render. First compute rows (replace the existing `const overlays = ...` and `lastOverlayEnd` lines):
```tsx
  const rows = timelineRows(project);
  const { pinned, scrolling } = partitionPinned(rows);
  const lastOverlayEnd = Object.values(project.effects).reduce(
    (m, e) => Math.max(m, e.timing.start + e.timing.duration),
    0,
  );
```
Add a small renderer helper above `Timeline` (or inline) that maps a `TimelineRow` to its lane:
```tsx
function LaneRow({ row, pxPerFrame }: { row: TimelineRow; pxPerFrame: number }) {
  if (row.type === 'overlay') {
    const effect = useEditor((s) => s.project.effects[row.id]);
    if (!effect) return null;
    return <OverlayLane effect={effect} pxPerFrame={pxPerFrame} />;
  }
  return <TrackLane trackId={row.id} pxPerFrame={pxPerFrame} />;
}
```
Then in the JSX, replace the two `.map` blocks with:
```tsx
          {pinned.length > 0 && (
            <div className="timeline__pinned">
              {pinned.map((row) => (
                <LaneRow key={row.id} row={row} pxPerFrame={pxPerFrame} />
              ))}
            </div>
          )}
          {scrolling.map((row) => (
            <LaneRow key={row.id} row={row} pxPerFrame={pxPerFrame} />
          ))}
```
Keep the `<Ruler ... />` before the pinned band and the `<div className="playhead" ... />` after the scrolling rows.

- [ ] **Step 6: Build to verify it compiles + renders.**
Run: `npm run build`
Expected: `✓ built`. (The "chunks larger than 500 kB" note is pre-existing and fine.)

- [ ] **Step 7: Commit.**
```bash
git add src/ui/Timeline.tsx
git commit -m "timeline: render rows via timelineRows; grip reorder + pin buttons + pinned band"
```

---

## Task 7: Grip / pin / pinned-band styling

**Files:**
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `.lane__grip`, `.lane__toggle.is-on`, `.timeline__pinned` classes from Task 6.

- [ ] **Step 1: Add styles.** Append to `src/App.css` (near the other `.lane` rules):
```css
/* Reorder grip on each lane label. */
.lane__grip {
  cursor: grab;
  user-select: none;
  touch-action: none;
  color: #6b7180;
  font-size: 11px;
  line-height: 1;
  letter-spacing: -2px;
  padding: 0 4px 0 0;
}
.lane__grip:active {
  cursor: grabbing;
}
.lane__toggle.is-on {
  filter: none;
  opacity: 1;
  outline: 1px solid var(--accent);
  border-radius: 4px;
}

/* Pinned rows: a sticky band that stays at the top while the rest scroll. */
.timeline__pinned {
  position: sticky;
  top: 26px; /* below the 26px ruler */
  z-index: 6; /* above clips (z 2-3) and below the playhead's needs */
  background: var(--panel);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}
.timeline__pinned .lane {
  background: color-mix(in srgb, var(--panel-2) 80%, var(--accent) 6%);
}
```
Note on the sticky band: it wraps all pinned lanes in one sticky container that sticks just under the ruler (the ruler is `position: relative; height: 26px`). Because the band is inside the same horizontally-scrolling content, pinned lanes scroll left/right with the timeline but stay fixed vertically — exactly the desired behavior. The existing `.lane__label { position: sticky; left: 0 }` keeps the labels pinned horizontally too.

- [ ] **Step 2: Manual check.** Run `npm run dev`, open http://localhost:5173, add a few text overlays, pin the Video and Audio rows (📌). Confirm: pinned rows sit in a band at the top, the overlay lanes scroll under them, and dragging a lane's `⋮⋮` grip reorders it among its group only.

- [ ] **Step 3: Commit.**
```bash
git add src/App.css
git commit -m "timeline: styles for reorder grip, pin button, sticky pinned band"
```

---

## Task 8: e2e coverage + full verify

**Files:**
- Modify: `scripts/e2e.mjs` (add a reorder + pin step after STEP 13g)

**Interfaces:**
- Consumes: `.lane__grip`, `.lane__toggle`, `data-row-id`, `.lane--overlay`.

- [ ] **Step 1: Add an e2e step.** In `scripts/e2e.mjs`, after STEP 13g (image overlay) and before STEP 14, insert:
```js
  log('STEP 13h — reorder + pin overlay lanes');
  // There are now several overlay lanes (text, captions, shape, lower-third, image).
  const overlayIdsTopDown = await page.$$eval('.lane--overlay', (els) =>
    els.map((e) => e.getAttribute('data-row-id')),
  );
  assert(overlayIdsTopDown.length >= 2, 'multiple overlay lanes present to reorder');
  // Drag the top overlay lane's grip down past the second lane.
  const firstGrip = page.locator('.lane--overlay .lane__grip').first();
  const box1 = await firstGrip.boundingBox();
  const secondLane = page.locator('.lane--overlay').nth(1);
  const box2 = await secondLane.boundingBox();
  await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
  await page.mouse.down();
  await page.mouse.move(box1.x + box1.width / 2, box2.y + box2.height + 4, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const afterIds = await page.$$eval('.lane--overlay', (els) =>
    els.map((e) => e.getAttribute('data-row-id')),
  );
  assert(
    afterIds[0] !== overlayIdsTopDown[0],
    `top overlay lane changed after reorder (${overlayIdsTopDown[0]} -> ${afterIds[0]})`,
  );

  // Pin the Video track row; it should move into the sticky pinned band.
  await page.locator('.lane--video [aria-label="Pin row to top"]').first().click();
  await page.waitForTimeout(80);
  assert(
    (await page.locator('.timeline__pinned .lane--video').count()) === 1,
    'pinning the video row moves it into the sticky band',
  );
```

- [ ] **Step 1b: Fix the pre-existing STEP 19 selectors (REQUIRED — Task 6 adds a 📌 button that shifts `.lane__toggle` indices).** In `scripts/e2e.mjs` STEP 19, the mute/hide clicks currently use `.lane__toggle` `.first()`, which would now hit the new pin button. Change them to target by aria-label. Replace:
```js
  await page.locator('.lane--audio .lane__toggle').first().click();
  await page.locator('.lane--video .lane__toggle').first().click();
```
with:
```js
  await page.locator('.lane--audio [aria-label="Mute track"]').first().click();
  await page.locator('.lane--video [aria-label="Hide track"]').first().click();
```
(The mute button's label is `Mute track` when un-muted; the hide button's is `Hide track` when visible — both true at this point in the flow.)

- [ ] **Step 2: Run the e2e.**
Run (kill any stale dev server first): `npm run e2e`
Expected: `E2E PASS`, including the two new STEP 13h assertions.

- [ ] **Step 3: Run the full gate.**
Run: `npm run verify`
Expected: EXIT 0 — typecheck, unit, e2e, export, video, persist all green.

- [ ] **Step 4: Commit.**
```bash
git add scripts/e2e.mjs
git commit -m "e2e: reorder an overlay lane + pin a row into the sticky band"
```

---

## Self-Review notes (already folded in)

- **Spec coverage:** reorder within group (Tasks 4–6), pin = sticky band (Tasks 4,6,7), "overlays push video/audio down" answered by pin. ✓
- **Z-order safety:** `getActiveEffects` keeps bottom-to-top `effectOrder` direction (Task 3), so existing overlay/lower-third stacking is unchanged; only the *display* reverses. ✓
- **Persistence:** `effectOrder` + `pinned` are plain document data; they round-trip through `migrate.ts` (Task 1) → autosave + project file. The existing e2e STEP 19c (relative round-trip counts) covers them; no extra work. ✓
- **No new dependencies.** Reorder is hand-rolled pointer drag (matches the codebase); pinning is CSS `position: sticky`. ✓

## Risks / watch-outs for the implementer

1. **Grip vs clip drag:** the grip lives in the sticky `.lane__label` gutter, which is separate from the `.lane__area` where clips/overlay blocks are dragged — so the two gestures never collide. Verify the grip's `onPointerDown` calls `stopPropagation()` (it does) so it doesn't also start a clip-area interaction.
2. **`elementsFromPoint` during pointer capture:** pointer capture routes events to the grip, but `document.elementsFromPoint(clientX, clientY)` still returns the element stack under the cursor, so target detection works. If it ever returns the captured grip first, the `.find(... classList.contains('lane'))` skips non-lane nodes.
3. **Pinned band height:** the sticky band has its own height; the playhead (absolute, full content height) still spans correctly because it's positioned in `.timeline__content`, not inside the band.
4. **Reordering a pinned row:** in v1 pinned rows are not drag-reorderable (their grip still works, but the drop-target detection only matches same-group lanes — a pinned row dropped over scrolling lanes will still reorder in the array, which is harmless). If this feels odd, a later iteration can disable the grip on pinned rows.
5. If `npm run typecheck` flags `React.PointerEvent` in `useRowReorder`, switch to importing `type PointerEvent as ReactPointerEvent from 'react'` and annotate with `ReactPointerEvent`.
