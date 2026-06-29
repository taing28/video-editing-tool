/**
 * core/time — the single source of truth for time math.
 *
 * GOLDEN RULE: time is stored as an integer number of FRAMES at the project's
 * fps. We never store seconds or floats in the document. Seconds are derived
 * only at the edges (audio scheduling, export muxing, timecode display).
 * This prevents drift, off-by-one trims, and audio/video desync.
 */

/** A whole number of frames. Invariant: integer. */
export type Frames = number;

/**
 * A span measured in frames, used both on the timeline (a clip's position) and
 * inside a source (a trim). `end` is ALWAYS derived (start + duration), never
 * stored — storing it would let the two drift apart.
 */
export interface FrameRange {
  /** Inclusive first frame. */
  start: Frames;
  /** Number of frames covered. Invariant: >= 1. */
  duration: Frames;
}

/** Exclusive end frame: the first frame NOT covered by the range. */
export function rangeEnd(r: FrameRange): Frames {
  return r.start + r.duration;
}

/** Is frame `f` inside [start, end)? */
export function rangeContains(r: FrameRange, f: Frames): boolean {
  return f >= r.start && f < rangeEnd(r);
}

/** Do two ranges overlap at all? (touching end-to-start does NOT count.) */
export function rangesOverlap(a: FrameRange, b: FrameRange): boolean {
  return a.start < rangeEnd(b) && b.start < rangeEnd(a);
}

/** Convert a frame count to seconds. Use ONLY at playback/export/display edges. */
export function framesToSeconds(frames: Frames, fps: number): number {
  return frames / fps;
}

/** Convert seconds to the nearest whole frame at the given fps. */
export function secondsToFrames(seconds: number, fps: number): Frames {
  return Math.round(seconds * fps);
}

/** Clamp a frame into [min, max] (inclusive). */
export function clampFrame(f: Frames, min: Frames, max: Frames): Frames {
  return Math.max(min, Math.min(max, f));
}

/** Snap a frame to the nearest multiple of `step` (e.g. for grid snapping). */
export function snapFrame(f: Frames, step: Frames): Frames {
  if (step <= 1) return Math.round(f);
  return Math.round(f / step) * step;
}

/**
 * Format a frame index as a SMPTE-style timecode HH:MM:SS:FF.
 * FF is the frame within the current second.
 */
export function formatTimecode(frame: Frames, fps: number): string {
  const safeFps = Math.max(1, Math.round(fps));
  const f = Math.max(0, Math.floor(frame));
  const totalSeconds = Math.floor(f / safeFps);
  const ff = f % safeFps;
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}
