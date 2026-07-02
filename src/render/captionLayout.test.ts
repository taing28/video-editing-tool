import { describe, it, expect } from 'vitest';
import { wrapCaptionLines } from './captionLayout';

// Without a DOM 2D context (node test env) the measurer falls back to
// `chars × fontSize × 0.55`, which makes these assertions deterministic:
// at fontSize 10 every character is 5.5px wide.
describe('wrapCaptionLines (preview/export caption wrap parity)', () => {
  it('wraps words that exceed maxWidth', () => {
    // 'aaaa bbbb' = 9 chars = 49.5px fits in 60; '+ cccc' = 77px does not.
    expect(wrapCaptionLines(['aaaa bbbb cccc'], 10, 'sans-serif', 60)).toEqual([
      'aaaa bbbb',
      'cccc',
    ]);
  });

  it('preserves explicit line breaks and empty lines', () => {
    expect(wrapCaptionLines(['short', '', 'also short'], 10, 'sans-serif', 200)).toEqual([
      'short',
      '',
      'also short',
    ]);
  });

  it('leaves a single over-wide word on its own line (no infinite loop)', () => {
    expect(wrapCaptionLines(['supercalifragilistic'], 10, 'sans-serif', 30)).toEqual([
      'supercalifragilistic',
    ]);
  });
});
