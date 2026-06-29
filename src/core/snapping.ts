/**
 * core/snapping — magnetic alignment for clip drags.
 *
 * Snap a dragged clip's nearest edge to other clips' edges, the playhead, or 0,
 * within a pixel-derived threshold. Pure functions so they're easy to test.
 */
import type { Project } from './model';
import type { ClipId } from './ids';
import type { Frames } from './time';

/** Candidate snap frames: 0, the playhead, and every other clip's edges. */
export function snapTargets(p: Project, excludeClipId: ClipId, playhead: Frames): Frames[] {
  const set = new Set<number>([0, playhead]);
  for (const c of Object.values(p.clips)) {
    if (c.id === excludeClipId) continue;
    set.add(c.startFrame);
    set.add(c.startFrame + c.durationInFrames);
  }
  return [...set];
}

/**
 * Snap a clip's start so its nearest edge (left = start, right = start+duration)
 * lands on a target within `threshold` frames. Returns the (clamped) start, or
 * the original start if nothing is close enough.
 */
export function snapStart(
  start: Frames,
  duration: Frames,
  targets: Frames[],
  threshold: Frames,
): Frames {
  let best = start;
  let bestDist = threshold + 1;
  for (const t of targets) {
    const distLeft = Math.abs(start - t);
    if (distLeft < bestDist) {
      bestDist = distLeft;
      best = t;
    }
    // Right-edge snap, but skip candidates that would push the start before 0
    // (otherwise they can win and clamp the clip to the origin).
    const rightStart = t - duration;
    const distRight = Math.abs(start + duration - t);
    if (rightStart >= 0 && distRight < bestDist) {
      bestDist = distRight;
      best = rightStart;
    }
  }
  return bestDist <= threshold ? Math.max(0, Math.round(best)) : start;
}
