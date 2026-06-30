import { describe, it, expect } from 'vitest';
import { kenBurnsBox } from './kenburns';

const base = { x: 0, y: 0, width: 100, height: 100, opacity: 1 };

describe('kenBurnsBox', () => {
  it('returns the base box for "none"', () => {
    expect(kenBurnsBox(base, 'none', 0.5)).toEqual(base);
  });

  it('zoomIn grows over time, staying centered', () => {
    const start = kenBurnsBox(base, 'zoomIn', 0);
    const end = kenBurnsBox(base, 'zoomIn', 1);
    expect(start.width).toBeCloseTo(100); // 1× at progress 0
    expect(end.width).toBeCloseTo(112); // 1.12× at progress 1
    expect(end.x + end.width / 2).toBeCloseTo(50); // center preserved
  });

  it('zoomOut shrinks over time', () => {
    expect(kenBurnsBox(base, 'zoomOut', 0).width).toBeCloseTo(112);
    expect(kenBurnsBox(base, 'zoomOut', 1).width).toBeCloseTo(100);
  });

  it('panLeft moves the box left over time (with a slight zoom)', () => {
    const start = kenBurnsBox(base, 'panLeft', 0);
    const end = kenBurnsBox(base, 'panLeft', 1);
    expect(start.width).toBeCloseTo(110); // pan zoom 1.1
    expect(end.x).toBeLessThan(start.x);
  });
});
