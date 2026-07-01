import { describe, it, expect } from 'vitest';
import { createEmptyProject, coverBox, containedBox } from './model';
import type { VideoClip, MediaAsset, Clip } from './model';
import { newClipId, newMediaId, newEffectId } from './ids';
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
  duplicateClip,
  buildSlideshow,
  insertEffect,
  removeEffect,
  duplicateEffect,
  moveEffect,
  trimEffectStart,
  trimEffectEnd,
  removeMedia,
  reorderEffectRelative,
  reorderTrackRelative,
  setTrackPinned,
} from './edits';
import {
  getTrackClips,
  fadeMultiplier,
  effectOpacity,
  overlapWithPrev,
  sourceFrameAt,
  voiceIntervals,
} from './selectors';
import type { AudioClip, Effect } from './model';

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

describe('effectOpacity (overlay fades)', () => {
  const eff = (fadeInFrames?: number, fadeOutFrames?: number) =>
    ({ timing: { start: 100, duration: 100 }, fadeInFrames, fadeOutFrames }) as unknown as Effect;

  it('is fully opaque when no fade is set', () => {
    expect(effectOpacity(eff(), 100)).toBe(1);
    expect(effectOpacity(eff(), 150)).toBe(1);
    expect(effectOpacity(eff(), 199)).toBe(1);
  });

  it('ramps in at the start and out at the end of the timing range', () => {
    const e = eff(10, 10); // frames 100..199
    expect(effectOpacity(e, 100)).toBeCloseTo(0); // very start
    expect(effectOpacity(e, 105)).toBeCloseTo(0.5);
    expect(effectOpacity(e, 150)).toBeCloseTo(1); // middle
    expect(effectOpacity(e, 195)).toBeCloseTo(0.5); // fading out
  });
});

describe('duplicateClip', () => {
  it('clones the clip onto the end of its track with a fresh id', () => {
    const { p, clipId, videoTrackId } = setup(); // clip at 100..200, dur 100
    const newId = newClipId();
    const out = duplicateClip(p, clipId, newId);
    const copy = out.clips[newId];
    const orig = out.clips[clipId];
    expect(copy).toBeTruthy();
    expect(copy.id).toBe(newId);
    expect(copy.startFrame).toBe(200); // appended after the original's end
    expect(copy.durationInFrames).toBe(orig.durationInFrames);
    expect(copy.kind).toBe(orig.kind);
    // both clips are on the track, in order
    expect(out.tracks[videoTrackId].clipOrder).toEqual([clipId, newId]);
    // effectIds is a fresh array, not shared
    expect(copy.effectIds).not.toBe(orig.effectIds);
  });

  it('is a no-op for an unknown clip', () => {
    const { p } = setup();
    expect(duplicateClip(p, newClipId(), newClipId())).toBe(p); // id not in project
  });
});

describe('overlay timing reducers (timeline lanes)', () => {
  function withEffect() {
    let p = createEmptyProject({ fps: 30 });
    const id = newEffectId();
    const eff = {
      id,
      type: 'text',
      timing: { start: 100, duration: 60 }, // frames 100..159
      text: 'hi',
      fontSize: 40,
      fontWeight: 700,
      fontFamily: 'sans',
      color: '#fff',
      x: 0,
      y: 0,
      align: 'left',
    } as unknown as Effect;
    p = insertEffect(p, eff);
    return { p, id };
  }

  it('moveEffect shifts start, keeps duration, clamps to >= 0', () => {
    const { p, id } = withEffect();
    expect(moveEffect(p, id, 250).effects[id].timing).toEqual({ start: 250, duration: 60 });
    expect(moveEffect(p, id, -20).effects[id].timing).toEqual({ start: 0, duration: 60 });
  });

  it('trimEffectStart keeps the end fixed and shortens from the left', () => {
    const { p, id } = withEffect(); // end = 160
    const t = trimEffectStart(p, id, 130).effects[id].timing;
    expect(t.start).toBe(130);
    expect(t.duration).toBe(30); // end still 160
  });

  it('trimEffectStart cannot cross the end (leaves >= 1 frame)', () => {
    const { p, id } = withEffect(); // end = 160
    const t = trimEffectStart(p, id, 999).effects[id].timing;
    expect(t).toEqual({ start: 159, duration: 1 });
  });

  it('trimEffectEnd changes only duration (>= 1)', () => {
    const { p, id } = withEffect(); // start 100
    expect(trimEffectEnd(p, id, 220).effects[id].timing).toEqual({ start: 100, duration: 120 });
    expect(trimEffectEnd(p, id, 50).effects[id].timing).toEqual({ start: 100, duration: 1 });
  });

  it('all three are no-ops for an unknown effect id', () => {
    const { p } = withEffect();
    const ghost = newEffectId();
    expect(moveEffect(p, ghost, 10)).toBe(p);
    expect(trimEffectStart(p, ghost, 10)).toBe(p);
    expect(trimEffectEnd(p, ghost, 10)).toBe(p);
  });
});

describe('removeMedia drops image overlays referencing it', () => {
  it('removes the asset AND any image effect that points at it', () => {
    let p = createEmptyProject({ fps: 30 });
    const mediaId = newMediaId();
    p = addMedia(p, {
      id: mediaId,
      kind: 'image',
      name: 'char.png',
      src: 'blob:x',
      durationInFrames: 90,
      width: 100,
      height: 100,
    });
    const effId = newEffectId();
    p = insertEffect(p, {
      id: effId,
      type: 'image',
      timing: { start: 0, duration: 30 },
      mediaId,
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      opacity: 1,
    } as unknown as Effect);
    expect(p.effects[effId]).toBeTruthy();

    const after = removeMedia(p, mediaId);
    expect(after.media[mediaId]).toBeUndefined();
    expect(after.effects[effId]).toBeUndefined(); // dangling overlay cleaned up
  });
});

describe('effectOrder maintenance', () => {
  const txt = (id: string) =>
    ({
      id,
      type: 'text',
      timing: { start: 0, duration: 30 },
      text: 't',
      fontSize: 40,
      fontWeight: 700,
      fontFamily: 'sans',
      color: '#fff',
      x: 0,
      y: 0,
      align: 'left',
    }) as unknown as Effect;

  it('insertEffect appends, removeEffect prunes', () => {
    let p = createEmptyProject({ fps: 30 });
    p = insertEffect(p, txt('a'));
    p = insertEffect(p, txt('b'));
    expect(p.effectOrder).toEqual(['a', 'b']);
    p = removeEffect(p, 'a' as unknown as Parameters<typeof removeEffect>[1]);
    expect(p.effectOrder).toEqual(['b']);
  });

  it('duplicateEffect inserts the copy right after the original', () => {
    let p = createEmptyProject({ fps: 30 });
    p = insertEffect(p, txt('a'));
    p = insertEffect(p, txt('b'));
    p = duplicateEffect(
      p,
      'a' as unknown as Parameters<typeof duplicateEffect>[1],
      'a2' as unknown as Parameters<typeof duplicateEffect>[2],
    );
    expect(p.effectOrder).toEqual(['a', 'a2', 'b']);
  });
});

describe('reorder + pin reducers', () => {
  it('reorderEffectRelative moves an id before/after a target', () => {
    let p = createEmptyProject({ fps: 30 });
    p = { ...p, effectOrder: ['a', 'b', 'c'] as unknown as typeof p.effectOrder };
    expect(reorderEffectRelative(p, 'c' as never, 'a' as never, 'before').effectOrder).toEqual([
      'c',
      'a',
      'b',
    ]);
    expect(reorderEffectRelative(p, 'a' as never, 'c' as never, 'after').effectOrder).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('reorderTrackRelative only moves within the same track kind', () => {
    const p = createEmptyProject({ fps: 30 }); // trackOrder = [video, audio]
    const [video, audio] = p.trackOrder;
    // different kinds → no-op (returns the same object)
    expect(reorderTrackRelative(p, video as never, audio as never, 'before')).toBe(p);
  });

  it('setEffectPinned / setTrackPinned toggle the flag', () => {
    const p = createEmptyProject({ fps: 30 });
    const track = p.trackOrder[0];
    expect(setTrackPinned(p, track as never, true).tracks[track].pinned).toBe(true);
  });
});

describe('buildSlideshow', () => {
  function twoImages() {
    let p = createEmptyProject({ fps: 30 });
    const m1 = newMediaId();
    const m2 = newMediaId();
    p = addMedia(p, { id: m1, kind: 'image', name: 'a', src: 'blob:a', durationInFrames: 150, width: 1920, height: 1080 });
    p = addMedia(p, { id: m2, kind: 'image', name: 'b', src: 'blob:b', durationInFrames: 150, width: 1080, height: 1920 });
    return p;
  }

  it('appends all image media as a crossfading, animated sequence', () => {
    const p = twoImages();
    const c1 = newClipId();
    const c2 = newClipId();
    const out = buildSlideshow(p, [c1, c2], {
      durationInFrames: 120,
      motion: true,
      crossfadeFrames: 15,
    });
    const video = out.trackOrder[0];
    expect(out.tracks[video].clipOrder).toEqual([c1, c2]);
    expect(out.clips[c1].startFrame).toBe(0);
    expect(out.clips[c1].durationInFrames).toBe(120);
    expect(out.clips[c2].startFrame).toBe(105); // 120 − 15 crossfade overlap
    const m = (c: Clip) => (c.kind !== 'audio' ? c.motion : null);
    expect(m(out.clips[c1])).toBe('zoomIn');
    expect(m(out.clips[c2])).toBe('zoomOut');
  });

  it('honours motion:false (no Ken Burns) and 0 crossfade (abutting)', () => {
    const p = twoImages();
    const c1 = newClipId();
    const c2 = newClipId();
    const out = buildSlideshow(p, [c1, c2], { durationInFrames: 120, motion: false, crossfadeFrames: 0 });
    expect(out.clips[c2].startFrame).toBe(120); // abuts
    const m = (c: Clip) => (c.kind !== 'audio' ? c.motion : null);
    expect(m(out.clips[c1])).toBe('none');
  });

  it('is a no-op with no images', () => {
    const p = createEmptyProject({ fps: 30 });
    expect(buildSlideshow(p, [], { durationInFrames: 120, motion: false, crossfadeFrames: 0 })).toBe(p);
  });
});
