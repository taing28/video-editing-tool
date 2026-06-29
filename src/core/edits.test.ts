import { describe, it, expect } from 'vitest';
import { createEmptyProject } from './model';
import type { VideoClip, MediaAsset } from './model';
import { newClipId, newMediaId } from './ids';
import {
  addMedia,
  insertClip,
  moveClip,
  trimClipStart,
  trimClipEnd,
  splitClip,
  setClipFade,
  setClipGain,
} from './edits';
import { getTrackClips, fadeMultiplier, overlapWithPrev } from './selectors';

function setup() {
  let p = createEmptyProject({ fps: 30 });
  const videoTrackId = p.trackOrder[0];
  const mediaId = newMediaId();
  const media: MediaAsset = {
    id: mediaId,
    kind: 'video',
    name: 'clip.mp4',
    src: 'blob:x',
    durationInFrames: 300, // 10s @ 30fps
    width: 1920,
    height: 1080,
  };
  p = addMedia(p, media);
  const clipId = newClipId();
  const clip: VideoClip = {
    id: clipId,
    trackId: videoTrackId,
    mediaId,
    startFrame: 100,
    durationInFrames: 100,
    sourceInFrame: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    effectIds: [],
    kind: 'video',
    transform: { x: 0, y: 0, width: 1920, height: 1080, opacity: 1 },
  };
  p = insertClip(p, clip);
  return { p, clipId, videoTrackId, mediaId };
}

describe('moveClip', () => {
  it('moves and clamps to >= 0', () => {
    const { p, clipId } = setup();
    expect(moveClip(p, clipId, 250).clips[clipId].startFrame).toBe(250);
    expect(moveClip(p, clipId, -50).clips[clipId].startFrame).toBe(0);
  });
});

describe('trimClipStart', () => {
  it('keeps the right edge fixed and advances the source trim', () => {
    const { p, clipId } = setup(); // start 100, dur 100, end 200
    const r = trimClipStart(p, clipId, 120).clips[clipId];
    expect(r.startFrame).toBe(120);
    expect(r.durationInFrames).toBe(80); // right edge still 200
    expect(r.sourceInFrame).toBe(20); // advanced into source
  });

  it('cannot pull the source before frame 0', () => {
    const { p, clipId } = setup(); // sourceInFrame 0
    const r = trimClipStart(p, clipId, 50).clips[clipId];
    expect(r.startFrame).toBe(100); // clamped: can't extend left of source start
    expect(r.sourceInFrame).toBe(0);
  });

  it('leaves at least one frame', () => {
    const { p, clipId } = setup();
    const r = trimClipStart(p, clipId, 500).clips[clipId];
    expect(r.durationInFrames).toBe(1);
  });
});

describe('trimClipEnd', () => {
  it('changes only duration and respects source length', () => {
    const { p, clipId } = setup(); // start 100, source 300 frames available
    expect(trimClipEnd(p, clipId, 250).clips[clipId].durationInFrames).toBe(150);
    // source only has 300 frames from offset 0 -> max duration 300
    expect(trimClipEnd(p, clipId, 9999).clips[clipId].durationInFrames).toBe(300);
  });
});

describe('splitClip', () => {
  it('splits into two abutting clips with correct source offsets', () => {
    const { p, clipId } = setup(); // start 100, dur 100
    const rightId = newClipId();
    const out = splitClip(p, clipId, 150, rightId);
    const left = out.clips[clipId];
    const right = out.clips[rightId];
    expect(left.durationInFrames).toBe(50);
    expect(right.startFrame).toBe(150);
    expect(right.durationInFrames).toBe(50);
    expect(right.sourceInFrame).toBe(50); // continues where left stopped
    expect(getTrackClips(out, left.trackId).map((c) => c.id)).toEqual([clipId, rightId]);
  });

  it('is a no-op when the cut is outside the clip', () => {
    const { p, clipId } = setup();
    expect(splitClip(p, clipId, 100, newClipId())).toBe(p); // at the very start
    expect(splitClip(p, clipId, 500, newClipId())).toBe(p); // past the end
  });
});

describe('fade', () => {
  it('clamps fade in + out to the clip length', () => {
    const { p, clipId } = setup(); // duration 100
    const withIn = setClipFade(p, clipId, { fadeInFrames: 60 });
    expect(withIn.clips[clipId].fadeInFrames).toBe(60);
    const withBoth = setClipFade(withIn, clipId, { fadeOutFrames: 80 });
    expect(withBoth.clips[clipId].fadeOutFrames).toBe(40); // clamped to dur - fadeIn
  });

  it('fadeMultiplier ramps 0→1 in and 1→0 out', () => {
    const { p, clipId } = setup(); // start 100, dur 100 -> frames 100..199
    const c = setClipFade(p, clipId, { fadeInFrames: 10, fadeOutFrames: 10 }).clips[clipId];
    expect(fadeMultiplier(c, 100)).toBeCloseTo(0); // very start
    expect(fadeMultiplier(c, 105)).toBeCloseTo(0.5);
    expect(fadeMultiplier(c, 150)).toBeCloseTo(1); // middle
    expect(fadeMultiplier(c, 195)).toBeCloseTo(0.5); // fading out
  });
});

describe('setClipGain', () => {
  it('is a no-op on non-audio clips', () => {
    const { p, clipId } = setup(); // a video clip
    expect(setClipGain(p, clipId, 0.5)).toBe(p);
  });
});

describe('overlapWithPrev (cross-dissolve)', () => {
  it('measures same-track overlap with the previous clip', () => {
    const { p, clipId } = setup(); // clip at 100..200
    const id2 = newClipId();
    const clip2 = { ...p.clips[clipId], id: id2, startFrame: 150 }; // overlaps by 50
    const p2 = insertClip(p, clip2);
    expect(overlapWithPrev(p2, p2.clips[id2])).toBe(50);
    expect(overlapWithPrev(p2, p2.clips[clipId])).toBe(0); // first clip, no previous
  });
});
