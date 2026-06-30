import { describe, it, expect } from 'vitest';
import { createEmptyProject } from '../core/model';
import type { Clip, VideoClip } from '../core/model';
import { migrateProject } from './migrate';
import { bundleFileName } from './projectFile';

describe('bundleFileName', () => {
  it('sanitizes the project name into a .videoproj.json filename', () => {
    expect(bundleFileName({ ...createEmptyProject(), name: 'My Reel' })).toBe(
      'My_Reel.videoproj.json',
    );
    expect(bundleFileName({ ...createEmptyProject(), name: 'a/b:c*?' })).toBe('a_b_c.videoproj.json');
    expect(bundleFileName({ ...createEmptyProject(), name: '' })).toBe('project.videoproj.json');
  });
});

describe('migrateProject', () => {
  it('fills fields added by later phases on older documents', () => {
    const p = createEmptyProject();
    const trackId = p.trackOrder[0];
    // An old-shape image clip missing speed/transition/motion/adjust.
    const old = {
      id: 'c1',
      trackId,
      mediaId: 'm1',
      startFrame: 0,
      durationInFrames: 30,
      sourceInFrame: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      effectIds: [],
      kind: 'image',
      transform: { x: 0, y: 0, width: 10, height: 10, opacity: 1 },
    } as unknown as Clip;
    p.clips['c1'] = old;

    migrateProject(p);

    const c = p.clips['c1'] as VideoClip;
    expect(c.speed).toBe(1);
    expect(c.transition).toBe('dissolve');
    expect(c.motion).toBe('none');
    expect(c.adjust).toEqual({ brightness: 1, contrast: 1, saturate: 1 });
  });

  it('defaults duck=false on old audio clips', () => {
    const p = createEmptyProject();
    p.clips['a1'] = {
      id: 'a1',
      trackId: p.trackOrder[1],
      mediaId: 'm2',
      startFrame: 0,
      durationInFrames: 30,
      sourceInFrame: 0,
      speed: 1,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      effectIds: [],
      kind: 'audio',
      gain: 1,
    } as unknown as Clip;
    migrateProject(p);
    expect((p.clips['a1'] as { duck: boolean }).duck).toBe(false);
  });
});
