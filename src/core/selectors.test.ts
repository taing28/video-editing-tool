import { describe, it, expect } from 'vitest';
import { createEmptyProject } from './model';
import type { CaptionEffect, Effect, Project } from './model';
import { insertEffect } from './edits';
import { newEffectId } from './ids';
import {
  getActiveEffects,
  timelineRows,
  partitionPinned,
  captionWords,
  activeCaptionWordIndex,
} from './selectors';

const cap = (text: string, start: number, duration: number): CaptionEffect => ({
  id: 'c' as unknown as CaptionEffect['id'],
  type: 'caption',
  timing: { start, duration },
  text,
  fontSize: 40,
  fontFamily: 'sans',
  color: '#fff',
  karaoke: true,
});

describe('captionWords (karaoke, even timing)', () => {
  it('splits text into evenly-timed words (offsets from timing.start)', () => {
    expect(captionWords(cap('a b c d', 0, 40))).toEqual([
      { text: 'a', start: 0, end: 10 },
      { text: 'b', start: 10, end: 20 },
      { text: 'c', start: 20, end: 30 },
      { text: 'd', start: 30, end: 40 },
    ]);
  });
  it('handles newlines + extra spaces + empty', () => {
    expect(captionWords(cap('  one\ntwo  ', 0, 20)).map((w) => w.text)).toEqual(['one', 'two']);
    expect(captionWords(cap('   ', 0, 20))).toEqual([]);
  });
});

describe('activeCaptionWordIndex', () => {
  it('returns the word under the frame, -1 outside', () => {
    const c = cap('a b c d', 100, 40); // words at offsets 0..10,10..20,20..30,30..40
    expect(activeCaptionWordIndex(c, 100)).toBe(0);
    expect(activeCaptionWordIndex(c, 115)).toBe(1);
    expect(activeCaptionWordIndex(c, 139)).toBe(3);
    expect(activeCaptionWordIndex(c, 99)).toBe(-1);
    expect(activeCaptionWordIndex(c, 140)).toBe(-1);
  });
});

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
