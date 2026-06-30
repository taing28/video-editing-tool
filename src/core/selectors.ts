/**
 * core/selectors — pure, read-only queries over a Project.
 *
 * Everything here is a pure function of (project, frame). These are the SINGLE
 * SOURCE OF TRUTH for "what is on screen / audible at frame N", consumed
 * identically by the preview renderer and (later) the export renderer.
 */
import type { Project, Track, Clip, VideoClip, AudioClip, Effect } from './model';
import { isVideoClip, isAudioClip } from './model';
import type { ClipId, TrackId } from './ids';
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

/** Global timed overlays active at `frame`, in id-stable order. */
export function getActiveEffects(p: Project, frame: Frames): Effect[] {
  return Object.values(p.effects).filter((e) => rangeContains(e.timing, frame));
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

/** Total timeline length: the furthest clip end across all tracks. */
export function computeDuration(p: Project): Frames {
  let max = 0;
  for (const clip of Object.values(p.clips)) {
    max = Math.max(max, rangeEnd(clipRange(clip)));
  }
  return max;
}

/** Find the track a clip belongs to. */
export function trackOfClip(p: Project, clipId: ClipId): Track | undefined {
  const clip = p.clips[clipId];
  return clip ? p.tracks[clip.trackId] : undefined;
}
