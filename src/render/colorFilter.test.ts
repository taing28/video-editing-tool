import { describe, it, expect } from 'vitest';
import { NEUTRAL_ADJUST, isNeutralAdjust, filterString, getFilteredCanvas } from './colorFilter';

describe('colorFilter', () => {
  it('detects the neutral adjust', () => {
    expect(isNeutralAdjust(NEUTRAL_ADJUST)).toBe(true);
    expect(isNeutralAdjust({ brightness: 1, contrast: 1, saturate: 1 })).toBe(true);
    expect(isNeutralAdjust({ brightness: 1.2, contrast: 1, saturate: 1 })).toBe(false);
    expect(isNeutralAdjust({ brightness: 1, contrast: 0.8, saturate: 1 })).toBe(false);
    expect(isNeutralAdjust({ brightness: 1, contrast: 1, saturate: 0 })).toBe(false);
  });

  it('builds a CSS filter string', () => {
    expect(filterString({ brightness: 1.2, contrast: 0.9, saturate: 1.5 })).toBe(
      'brightness(1.2) contrast(0.9) saturate(1.5)',
    );
  });

  it('returns the source unchanged for a neutral adjust (no canvas work)', () => {
    const source = {} as unknown as CanvasImageSource;
    expect(getFilteredCanvas('k', source, 100, 100, NEUTRAL_ADJUST)).toBe(source);
  });
});
