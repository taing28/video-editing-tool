/**
 * core/selectors — pure, read-only queries over a Project.
 *
 * Everything here is a pure function of (project, frame). These are the SINGLE
 * SOURCE OF TRUTH for "what is on screen / audible at frame N", consumed
 * identically by the preview renderer and (later) the export renderer.
 */
import type {
  Project,
  Track,
  Clip,
  VideoClip,
  AudioClip,
  Effect,
  CaptionEffect,
  TrackKind,
} from './model';
import { isVideoClip, isAudioClip } from './model';
import type { ClipId, TrackId, EffectId } from './ids';
import type { Frames } from './time';
import { rangeContains, rangeEnd } from './time';

/** A clip's on-timeline range as a FrameRange. */
export function clipRange(c: Clip) {
  return { start: c.startFrame, duration: c.durationInFrames };
}

/** Clips on a track, in left-to-right order. */
export function getTrackClips(p: Project, trackId: TrackId): Clip[] {
  const track = p.tracks[trackId];
  if (!track) return [];
  return track.clipOrder.map((id) => p.clips[id]).filter(Boolean) as Clip[];
}

export function getTracksInOrder(p: Project): Track[] {
  return p.trackOrder.map((id) => p.tracks[id]).filter(Boolean) as Track[];
}

/** The single video/image clip showing on a track at `frame`, if any. */
export function clipAtFrame(p: Project, trackId: TrackId, frame: Frames): Clip | undefined {
  return getTrackClips(p, trackId).find((c) => rangeContains(clipRange(c), frame));
}

/**
 * All visible clips at `frame`, bottom-to-top in compositing order (so the
 * caller paints them in array order and later clips land on top).
 */
export function getActiveVideoClips(
  p: Project,
  frame: Frames,
): Array<{ clip: VideoClip; track: Track }> {
  const out: Array<{ clip: VideoClip; track: Track }> = [];
  // trackOrder is top-to-bottom; paint bottom-to-top so the top row lands on
  // top. Iterate in reverse so the last (bottom) track is pushed first.
  const tracks = getTracksInOrder(p);
  for (let i = tracks.length - 1; i >= 0; i--) {
    const track = tracks[i];
    if (track.kind !== 'video' || track.hidden) continue;
    for (const clip of getTrackClips(p, track.id)) {
      if (isVideoClip(clip) && rangeContains(clipRange(clip), frame)) {
        out.push({ clip, track });
      }
    }
  }
  return out;
}

/** All audible clips at `frame` (used by the audio scheduler / mixdown). */
export function getActiveAudioClips(
  p: Project,
  frame: Frames,
): Array<{ clip: AudioClip; track: Track }> {
  const out: Array<{ clip: AudioClip; track: Track }> = [];
  for (const track of getTracksInOrder(p)) {
    if (track.kind !== 'audio' || track.muted) continue;
    for (const clip of getTrackClips(p, track.id)) {
      if (isAudioClip(clip) && rangeContains(clipRange(clip), frame)) {
        out.push({ clip, track });
      }
    }
  }
  return out;
}

/** Global timed overlays active at `frame`, in effectOrder (bottom-to-top paint order). */
export function getActiveEffects(p: Project, frame: Frames): Effect[] {
  const out: Effect[] = [];
  for (const id of p.effectOrder) {
    const e = p.effects[id];
    if (e && rangeContains(e.timing, frame)) out.push(e);
  }
  return out;
}

/**
 * Which frame of the SOURCE media is showing for a clip at timeline `frame`.
 * (timeline offset into the clip) + (the clip's trim point into the source)
 */
export function sourceFrameAt(clip: Clip, frame: Frames): Frames {
  return clip.sourceInFrame + (frame - clip.startFrame) * clip.speed;
}

/**
 * Linear fade envelope (0..1) at `frame`, ramping up over `fadeInFrames` at the
 * start and down over `fadeOutFrames` at the end of a span.
 */
export function fadeEnvelope(
  frame: Frames,
  startFrame: Frames,
  durationInFrames: Frames,
  fadeInFrames: Frames,
  fadeOutFrames: Frames,
): number {
  let m = 1;
  const into = frame - startFrame;
  const fromEnd = startFrame + durationInFrames - frame;
  if (fadeInFrames > 0 && into < fadeInFrames) m *= into / fadeInFrames;
  if (fadeOutFrames > 0 && fromEnd < fadeOutFrames) m *= fromEnd / fadeOutFrames;
  return Math.max(0, Math.min(1, m));
}

/** Fade envelope using a clip's own fadeIn/fadeOut. */
export function fadeMultiplier(clip: Clip, frame: Frames): number {
  return fadeEnvelope(
    frame,
    clip.startFrame,
    clip.durationInFrames,
    clip.fadeInFrames,
    clip.fadeOutFrames,
  );
}

/** One karaoke word with start/end OFFSETS (frames) from the caption's start. */
export interface CaptionWord {
  text: string;
  start: Frames;
  end: Frames;
}

/**
 * Split a caption into words, evenly timed across its duration. Deterministic
 * and pure (no speech data needed) — the highlight sweeps at a constant rate.
 */
export function captionWords(effect: CaptionEffect): CaptionWord[] {
  // Speech-synced timings (from auto-caption) win; the even split is the
  // fallback for hand-typed captions.
  if (effect.words && effect.words.length > 0) return effect.words;
  const words = effect.text.split(/\s+/).filter(Boolean);
  const n = words.length;
  if (n === 0) return [];
  const dur = Math.max(1, effect.timing.duration);
  return words.map((text, i) => ({
    text,
    start: Math.round((i * dur) / n),
    end: Math.round(((i + 1) * dur) / n),
  }));
}

/** Index of the karaoke word active at `frame`, or -1 if none. */
export function activeCaptionWordIndex(effect: CaptionEffect, frame: Frames): number {
  const into = frame - effect.timing.start;
  const words = captionWords(effect);
  for (let i = 0; i < words.length; i++) {
    if (into >= words[i].start && into < words[i].end) return i;
  }
  return -1;
}

/** Opacity envelope (0..1) for a timed overlay, from its own fadeIn/fadeOut. */
export function effectOpacity(effect: Effect, frame: Frames): number {
  return fadeEnvelope(
    frame,
    effect.timing.start,
    effect.timing.duration,
    effect.fadeInFrames ?? 0,
    effect.fadeOutFrames ?? 0,
  );
}

/**
 * How many frames a clip overlaps the previous clip on its track. A positive
 * overlap on a video track is rendered as a cross-dissolve (this clip fades in
 * over the overlap while the previous one plays underneath).
 */
export function overlapWithPrev(p: Project, clip: Clip): Frames {
  const track = p.tracks[clip.trackId];
  if (!track) return 0;
  const idx = track.clipOrder.indexOf(clip.id);
  if (idx <= 0) return 0;
  const prev = p.clips[track.clipOrder[idx - 1]];
  if (!prev) return 0;
  return Math.max(0, prev.startFrame + prev.durationInFrames - clip.startFrame);
}

/**
 * Merged timeline ranges (frames) of "voice" — audio clips NOT marked `duck`.
 * Ducked clips lower their volume whenever one of these is playing.
 */
export function voiceIntervals(p: Project): Array<[Frames, Frames]> {
  const ranges: Array<[number, number]> = [];
  for (const clip of Object.values(p.clips)) {
    if (clip.kind === 'audio' && !clip.duck) {
      // A muted track is inaudible — it can't be the voice others duck under.
      if (p.tracks[clip.trackId]?.muted) continue;
      ranges.push([clip.startFrame, clip.startFrame + clip.durationInFrames]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

/**
 * Total timeline length: the furthest end across clips AND timed overlays —
 * a caption/text that outlasts the last clip still plays out (and exports)
 * instead of being silently cut off.
 */
export function computeDuration(p: Project): Frames {
  let max = 0;
  for (const clip of Object.values(p.clips)) {
    max = Math.max(max, rangeEnd(clipRange(clip)));
  }
  for (const effect of Object.values(p.effects)) {
    max = Math.max(max, rangeEnd(effect.timing));
  }
  return max;
}

/** Find the track a clip belongs to. */
export function trackOfClip(p: Project, clipId: ClipId): Track | undefined {
  const clip = p.clips[clipId];
  return clip ? p.tracks[clip.trackId] : undefined;
}

export type TimelineRow =
  | { type: 'overlay'; id: EffectId; pinned: boolean }
  | { type: 'track'; id: TrackId; kind: TrackKind; pinned: boolean };

/** Display order, top-to-bottom: overlays (top lane = last in effectOrder), then tracks. */
export function timelineRows(p: Project): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (let i = p.effectOrder.length - 1; i >= 0; i--) {
    const e = p.effects[p.effectOrder[i]];
    if (e) rows.push({ type: 'overlay', id: e.id, pinned: !!e.pinned });
  }
  for (const t of getTracksInOrder(p)) {
    rows.push({ type: 'track', id: t.id, kind: t.kind, pinned: !!t.pinned });
  }
  return rows;
}

/** Split rows into the sticky pinned band and the scrolling remainder (order kept). */
export function partitionPinned(rows: TimelineRow[]): {
  pinned: TimelineRow[];
  scrolling: TimelineRow[];
} {
  return { pinned: rows.filter((r) => r.pinned), scrolling: rows.filter((r) => !r.pinned) };
}
