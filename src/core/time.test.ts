import { describe, it, expect } from 'vitest';
import {
  rangeEnd,
  rangeContains,
  rangesOverlap,
  framesToSeconds,
  secondsToFrames,
  clampFrame,
  snapFrame,
  formatTimecode,
} from './time';

describe('FrameRange math', () => {
  it('derives the exclusive end', () => {
    expect(rangeEnd({ start: 10, duration: 5 })).toBe(15);
  });

  it('contains frames in [start, end)', () => {
    const r = { start: 10, duration: 5 }; // covers 10..14
    expect(rangeContains(r, 9)).toBe(false);
    expect(rangeContains(r, 10)).toBe(true);
    expect(rangeContains(r, 14)).toBe(true);
    expect(rangeContains(r, 15)).toBe(false); // end is exclusive
  });

  it('detects overlap but treats touching as non-overlapping', () => {
    expect(rangesOverlap({ start: 0, duration: 10 }, { start: 5, duration: 10 })).toBe(true);
    expect(rangesOverlap({ start: 0, duration: 10 }, { start: 10, duration: 5 })).toBe(false); // touch
    expect(rangesOverlap({ start: 0, duration: 10 }, { start: 20, duration: 5 })).toBe(false);
  });
});

describe('frame/second conversion', () => {
  it('round-trips whole frames at 30fps', () => {
    expect(framesToSeconds(30, 30)).toBe(1);
    expect(secondsToFrames(1, 30)).toBe(30);
    expect(secondsToFrames(2.5, 30)).toBe(75);
  });

  it('rounds to the nearest frame', () => {
    expect(secondsToFrames(0.49 / 30, 30)).toBe(0);
    expect(secondsToFrames(0.51 / 30, 30)).toBe(1);
  });
});

describe('clamp & snap', () => {
  it('clamps into range', () => {
    expect(clampFrame(-5, 0, 100)).toBe(0);
    expect(clampFrame(150, 0, 100)).toBe(100);
    expect(clampFrame(50, 0, 100)).toBe(50);
  });

  it('snaps to a step', () => {
    expect(snapFrame(7, 5)).toBe(5);
    expect(snapFrame(8, 5)).toBe(10);
    expect(snapFrame(42, 1)).toBe(42);
  });
});

describe('timecode', () => {
  it('formats HH:MM:SS:FF at 30fps', () => {
    expect(formatTimecode(0, 30)).toBe('00:00:00:00');
    expect(formatTimecode(29, 30)).toBe('00:00:00:29');
    expect(formatTimecode(30, 30)).toBe('00:00:01:00');
    expect(formatTimecode(90, 30)).toBe('00:00:03:00');
    expect(formatTimecode(30 * 60, 30)).toBe('00:01:00:00');
    expect(formatTimecode(30 * 3600, 30)).toBe('01:00:00:00');
  });
});
