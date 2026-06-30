import { describe, it, expect } from 'vitest';
import { createEmptyProject } from '../core/model';
import type { VideoClip, MediaAsset, TransitionType } from '../core/model';
import { newClipId, newMediaId } from '../core/ids';
import { addMedia, insertClip } from '../core/edits';
import { buildScene, type ImageLayer } from './scene';

function setup(transition: TransitionType) {
  let p = createEmptyProject({ fps: 30 });
  const trackId = p.trackOrder[0];
  const mediaId = newMediaId();
  const media: MediaAsset = {
    id: mediaId,
    kind: 'image',
    name: 'x',
    src: 'blob:x',
    durationInFrames: 100,
    width: 100,
    height: 100,
  };
  p = addMedia(p, media);
  const base = {
    trackId,
    mediaId,
    durationInFrames: 50,
    sourceInFrame: 0,
    speed: 1,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    effectIds: [],
    kind: 'image' as const,
    transform: { x: 0, y: 0, width: 100, height: 100, opacity: 1 },
    transition: 'dissolve' as TransitionType,
  };
  const a: VideoClip = { ...base, id: newClipId(), startFrame: 0 };
  const bId = newClipId();
  const b: VideoClip = { ...base, id: bId, startFrame: 40, transition }; // overlaps A by 10
  p = insertClip(insertClip(p, a), b);
  return { p, bId };
}

const resolve = () => ({ drawable: {} as unknown as CanvasImageSource });
const bImage = (p: ReturnType<typeof setup>['p'], frame: number, bId: string) =>
  buildScene(p, frame, resolve).layers.find(
    (l): l is ImageLayer => l.kind === 'image' && l.clipId === bId,
  );

describe('buildScene transitions', () => {
  it('emits a wipe transition with overlap progress', () => {
    const { p, bId } = setup('wipe');
    const layer = bImage(p, 45, bId); // 5 of 10 overlap frames -> 0.5
    expect(layer?.transition?.type).toBe('wipe');
    expect(layer?.transition?.progress).toBeCloseTo(0.5);
    expect(layer?.opacity).toBe(1); // wipe doesn't dim
  });

  it('folds dissolve into opacity (no transition object)', () => {
    const { p, bId } = setup('dissolve');
    const layer = bImage(p, 45, bId);
    expect(layer?.transition).toBeUndefined();
    expect(layer?.opacity).toBeCloseTo(0.5);
  });
});
