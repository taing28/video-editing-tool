import { describe, it, expect } from 'vitest';
import { segmentsToCaptions } from './captions';
import { groupWords } from './transcribe';

const style = { fontSize: 50, fontFamily: 'sans', color: '#fff' };

describe('segmentsToCaptions', () => {
  it('converts segments to caption effects with frame timing', () => {
    const caps = segmentsToCaptions(
      [
        { text: ' Hello ', start: 0, end: 1 },
        { text: 'World', start: 1.5, end: 2.5 },
      ],
      30,
      style,
    );
    expect(caps).toHaveLength(2);
    expect(caps[0].type).toBe('caption');
    expect(caps[0].text).toBe('Hello'); // trimmed
    expect(caps[0].timing.start).toBe(0);
    expect(caps[0].timing.duration).toBe(30); // 1s @ 30fps
    expect(caps[1].timing.start).toBe(45); // 1.5s @ 30fps
  });

  it('skips empty segments and enforces a 0.3s minimum duration', () => {
    const caps = segmentsToCaptions(
      [
        { text: '   ', start: 0, end: 1 },
        { text: 'x', start: 0, end: 0.05 },
      ],
      30,
      style,
    );
    expect(caps).toHaveLength(1);
    expect(caps[0].timing.duration).toBe(9); // 0.3s @ 30fps
  });

  it('carries speech-synced word timings as frame OFFSETS from the caption start', () => {
    const caps = segmentsToCaptions(
      [
        {
          text: 'hi there',
          start: 1,
          end: 3,
          words: [
            { text: 'hi', start: 1, end: 1.4 },
            { text: 'there', start: 2.2, end: 3 }, // pause before it
          ],
        },
      ],
      30,
      style,
    );
    expect(caps[0].timing.start).toBe(30);
    expect(caps[0].words).toEqual([
      { text: 'hi', start: 0, end: 12 }, // 0..0.4s into the caption
      { text: 'there', start: 36, end: 60 }, // 1.2..2s into the caption
    ]);
  });
});

describe('groupWords (word chunks → caption segments)', () => {
  const w = (text: string, start: number, end: number) => ({ text, start, end });

  it('keeps a short continuous phrase as one segment with word timings', () => {
    const segs = groupWords([w('one', 0, 0.3), w('two', 0.35, 0.6), w('three', 0.7, 1)]);
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('one two three');
    expect(segs[0].start).toBe(0);
    expect(segs[0].end).toBe(1);
    expect(segs[0].words).toHaveLength(3);
  });

  it('splits on a long pause', () => {
    const segs = groupWords([w('hello', 0, 0.4), w('again', 1.5, 1.9)]); // 1.1s gap
    expect(segs.map((s) => s.text)).toEqual(['hello', 'again']);
  });

  it('splits when the line grows past the char limit', () => {
    const words = Array.from({ length: 12 }, (_, i) =>
      w('abcdef', i * 0.2, i * 0.2 + 0.15),
    );
    const segs = groupWords(words);
    expect(segs.length).toBeGreaterThan(1);
    for (const s of segs) expect(s.text.length).toBeLessThanOrEqual(48);
  });
});
