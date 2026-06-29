import { describe, it, expect } from 'vitest';
import { segmentsToCaptions } from './captions';

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
});
