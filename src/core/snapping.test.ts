import { describe, it, expect } from 'vitest';
import { snapStart } from './snapping';

describe('snapStart', () => {
  const targets = [0, 100, 250];

  it('snaps the left edge to a nearby target', () => {
    expect(snapStart(98, 50, targets, 5)).toBe(100); // 98 -> 100
  });

  it('snaps the right edge to a nearby target', () => {
    // start 53, duration 50 -> right edge 103; snaps right edge to 100 => start 50
    expect(snapStart(53, 50, targets, 5)).toBe(50);
  });

  it('leaves the start unchanged when nothing is within threshold', () => {
    expect(snapStart(170, 20, targets, 5)).toBe(170);
  });

  it('never returns a negative start', () => {
    expect(snapStart(2, 40, targets, 5)).toBe(0); // snaps left edge to 0
  });

  it('does not let a near-origin right-edge snap clamp the start to 0', () => {
    // left edge (98) is 2 from target 100; a right-edge snap to target 0 would
    // need start -50 (skipped), so the left-edge snap to 100 must win.
    expect(snapStart(98, 50, [0, 100], 5)).toBe(100);
  });
});
