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
    ({
      id,
      type: 'shape',
      timing: { start: 0, duration: 100 },
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      color: '#fff',
      opacity: 1,
    }) as unknown as Effect;
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
