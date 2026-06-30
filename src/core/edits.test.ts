import { describe, it, expect } from 'vitest';
import { createEmptyProject, coverBox, containedBox } from './model';
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
  setClipSpeed,
  fitClip,
} from './edits';
import {
  getTrackClips,
  fadeMultiplier,
  overlapWithPrev,
  sourceFrameAt,
  voiceIntervals,
} from './selectors';
import type { AudioClip } from './model';

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
    speed: 1,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    effectIds: [],
    kind: 'video',
    transform: { x: 0, y: 0, width: 1920, height: 1080, opacity: 1 },
    transition: 'dissolve',
    motion: 'none',
    adjust: { brightness: 1, contrast: 1, saturate: 1 },
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

describe('speed', () => {
  it('setClipSpeed re-times the clip, keeping the same source content', () => {
    const { p, clipId } = setup(); // duration 100, speed 1
    const fast = setClipSpeed(p, clipId, 2).clips[clipId];
    expect(fast.speed).toBe(2);
    expect(fast.durationInFrames).toBe(50); // 2× → half as long on the timeline
    const slow = setClipSpeed(p, clipId, 0.5).clips[clipId];
    expect(slow.durationInFrames).toBe(200); // 0.5× → twice as long
  });

  it('sourceFrameAt advances by speed per timeline frame', () => {
    const { p, clipId } = setup(); // start 100, source 0
    const c = setClipSpeed(p, clipId, 2).clips[clipId];
    expect(sourceFrameAt(c, 110)).toBe(20); // 10 timeline frames × 2
  });
});

describe('voiceIntervals (ducking)', () => {
  it('merges non-ducked audio ranges and excludes ducked clips', () => {
    let p = createEmptyProject({ fps: 30 });
    const audioTrack = p.trackOrder[1];
    const mk = (start: number, dur: number, duck: boolean): AudioClip => ({
      id: newClipId(),
      trackId: audioTrack,
      mediaId: newMediaId(),
      startFrame: start,
      durationInFrames: dur,
      sourceInFrame: 0,
      speed: 1,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      effectIds: [],
      kind: 'audio',
      gain: 1,
      duck,
    });
    p = insertClip(p, mk(0, 30, false)); // voice 0..30
    p = insertClip(p, mk(20, 30, false)); // voice 20..50 → merges to 0..50
    p = insertClip(p, mk(60, 30, true)); // ducked → excluded
    expect(voiceIntervals(p)).toEqual([[0, 50]]);
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

describe('coverBox / fitClip (object-fit)', () => {
  it('coverBox fills the frame and overflows one axis; containedBox fits inside', () => {
    const cover = coverBox(1920, 1080, 1080, 1920); // landscape media → vertical frame
    expect(cover.height).toBeCloseTo(1920); // covers the tall axis exactly
    expect(cover.width).toBeGreaterThan(1080); // overflows horizontally
    expect(cover.x).toBeLessThan(0); // centered → negative offset
    const contain = containedBox(1920, 1080, 1080, 1920);
    expect(contain.width).toBeCloseTo(1080); // fits the wide axis exactly
    expect(contain.height).toBeLessThan(1920); // letterboxed vertically
  });

  it('fitClip applies contain / cover / stretch from the media size, keeping opacity', () => {
    let p = createEmptyProject({ width: 1080, height: 1920 });
    const trackId = p.trackOrder[0];
    const mediaId = newMediaId();
    p = addMedia(p, {
      id: mediaId,
      kind: 'image',
      name: 'wide.png',
      src: 'blob:x',
      durationInFrames: 90,
      width: 1920,
      height: 1080,
    });
    const id = newClipId();
    const clip: VideoClip = {
      id,
      trackId,
      mediaId,
      startFrame: 0,
      durationInFrames: 90,
      sourceInFrame: 0,
      speed: 1,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      effectIds: [],
      kind: 'image',
      transform: { x: 0, y: 0, width: 100, height: 100, opacity: 0.4 },
      transition: 'dissolve',
      motion: 'none',
      adjust: { brightness: 1, contrast: 1, saturate: 1 },
    };
    p = insertClip(p, clip);

    const filled = fitClip(p, id, 'cover').clips[id];
    expect(filled.kind !== 'audio' && filled.transform.width).toBeGreaterThan(1080);
    expect(filled.kind !== 'audio' && filled.transform.opacity).toBe(0.4); // preserved

    const fitted = fitClip(p, id, 'contain').clips[id];
    expect(fitted.kind !== 'audio' && fitted.transform.width).toBeCloseTo(1080);

    const stretched = fitClip(p, id, 'stretch').clips[id];
    const st = stretched.kind !== 'audio' ? stretched.transform : null;
    expect(st).toEqual({ x: 0, y: 0, width: 1080, height: 1920, opacity: 0.4 });
  });
});
