import { describe, it, expect } from 'vitest';
import { computeDuckRamps } from './duck';

describe('computeDuckRamps', () => {
  it('ducks when voice starts and restores when it ends', () => {
    const { start, ramps } = computeDuckRamps(0, 10, [[2, 5]], 0.3);
    expect(start).toBe(1); // not ducked at the window start
    expect(ramps).toEqual([
      { atSec: 2, level: 0.3 },
      { atSec: 5, level: 1 },
    ]);
  });

  it('starts ducked if voice is already playing at the window start', () => {
    const { start, ramps } = computeDuckRamps(3, 10, [[0, 5]], 0.3);
    expect(start).toBe(0.3);
    expect(ramps).toEqual([{ atSec: 2, level: 1 }]); // voice ends at 5 → 5-3
  });

  it('ignores voice outside the window', () => {
    expect(computeDuckRamps(0, 2, [[5, 8]], 0.3).ramps).toEqual([]);
  });
});
