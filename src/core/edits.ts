/**
 * core/edits — pure reducers over a Project.
 *
 * Every editing operation is `(Project, args) => Project` and never mutates its
 * input. ID generation and other side effects live in the store/action layer,
 * so these stay deterministic and trivially testable. Undo/redo is handled by
 * the store snapshotting the document around each call.
 */
import type { Project, Clip, VideoClip, Track, MediaAsset, Effect, FitMode, Transform } from './model';
import { getMedia, isVideoClip, containedBox, coverBox } from './model';
import type { ClipId, EffectId, MediaId, TrackId } from './ids';
import type { Frames } from './time';
import { clampFrame } from './time';
import { computeDuration } from './selectors';

// --- immutable helpers ------------------------------------------------------

function recompute(p: Project): Project {
  return { ...p, durationInFrames: computeDuration(p) };
}

/** Keep a track's clipOrder sorted left-to-right by start frame. */
function sortTrack(p: Project, trackId: TrackId): Project {
  const track = p.tracks[trackId];
  if (!track) return p;
  const sorted = [...track.clipOrder].sort((a, b) => {
    const ca = p.clips[a];
    const cb = p.clips[b];
    return (ca?.startFrame ?? 0) - (cb?.startFrame ?? 0);
  });
  return { ...p, tracks: { ...p.tracks, [trackId]: { ...track, clipOrder: sorted } } };
}

function putClip(p: Project, clip: Clip): Project {
  return { ...p, clips: { ...p.clips, [clip.id]: clip } };
}

/**
 * The highest source frame a clip may show: images are an infinite still, so
 * unbounded; video/audio are limited by the source's natural length.
 */
function sourceLimit(p: Project, clip: Clip): Frames {
  const media = getMedia(p, clip.mediaId);
  if (!media || media.kind === 'image') return Number.POSITIVE_INFINITY;
  return media.durationInFrames;
}

// --- media ------------------------------------------------------------------

export function addMedia(p: Project, asset: MediaAsset): Project {
  return { ...p, media: { ...p.media, [asset.id]: asset } };
}

/** Remove a media asset and every clip that uses it. */
export function removeMedia(p: Project, mediaId: MediaId): Project {
  if (!p.media[mediaId]) return p;
  const media = { ...p.media };
  delete media[mediaId];
  const clips = { ...p.clips };
  const tracks = { ...p.tracks };
  for (const clip of Object.values(p.clips)) {
    if (clip.mediaId !== mediaId) continue;
    delete clips[clip.id];
    const track = tracks[clip.trackId];
    if (track) {
      tracks[clip.trackId] = {
        ...track,
        clipOrder: track.clipOrder.filter((id) => id !== clip.id),
      };
    }
  }
  // Image overlays reference media too — drop any that point at this asset so
  // we don't leave a dangling reference behind.
  const effects = { ...p.effects };
  for (const eff of Object.values(p.effects)) {
    if (eff.type === 'image' && eff.mediaId === mediaId) delete effects[eff.id];
  }
  return recompute({ ...p, media, clips, tracks, effects });
}

// --- clips ------------------------------------------------------------------

/** Insert a fully-formed clip (id already assigned by the caller). */
export function insertClip(p: Project, clip: Clip): Project {
  const track = p.tracks[clip.trackId];
  if (!track) return p;
  let next = putClip(p, clip);
  next = {
    ...next,
    tracks: {
      ...next.tracks,
      [track.id]: { ...track, clipOrder: [...track.clipOrder, clip.id] },
    },
  };
  return recompute(sortTrack(next, track.id));
}

export function removeClip(p: Project, clipId: ClipId): Project {
  const clip = p.clips[clipId];
  if (!clip) return p;
  const clips = { ...p.clips };
  delete clips[clipId];
  const track = p.tracks[clip.trackId];
  const tracks = track
    ? {
        ...p.tracks,
        [track.id]: { ...track, clipOrder: track.clipOrder.filter((id) => id !== clipId) },
      }
    : p.tracks;
  return recompute({ ...p, clips, tracks });
}

/** Move a clip along its track to a new start frame (clamped to >= 0). */
export function moveClip(p: Project, clipId: ClipId, newStartFrame: Frames): Project {
  const clip = p.clips[clipId];
  if (!clip) return p;
  const start = Math.max(0, Math.round(newStartFrame));
  if (start === clip.startFrame) return p;
  const next = putClip(p, { ...clip, startFrame: start });
  return recompute(sortTrack(next, clip.trackId));
}

/**
 * Drag the LEFT edge to `newStartFrame`. The right edge stays put: moving the
 * start also advances the trim point into the source and shortens the clip.
 * Clamped so duration >= 1 and the trim point never goes before the source's
 * first frame.
 */
export function trimClipStart(p: Project, clipId: ClipId, newStartFrame: Frames): Project {
  const clip = p.clips[clipId];
  if (!clip) return p;
  const rightEdge = clip.startFrame + clip.durationInFrames;
  // Each timeline frame consumes `speed` source frames, so the trim point can
  // only be pulled back by sourceInFrame/speed timeline frames.
  const minStart = Math.max(0, clip.startFrame - clip.sourceInFrame / clip.speed);
  const maxStart = rightEdge - 1; // keep at least 1 frame
  const start = clampFrame(Math.round(newStartFrame), minStart, maxStart);
  const delta = start - clip.startFrame;
  const next = putClip(p, {
    ...clip,
    startFrame: start,
    sourceInFrame: Math.max(0, Math.round(clip.sourceInFrame + delta * clip.speed)),
    durationInFrames: clip.durationInFrames - delta,
  });
  return recompute(sortTrack(next, clip.trackId));
}

/**
 * Drag the RIGHT edge to `newEndFrame`. The start stays put; only the duration
 * changes. Clamped so duration >= 1 and (for bounded sources) we don't read
 * past the end of the media.
 */
export function trimClipEnd(p: Project, clipId: ClipId, newEndFrame: Frames): Project {
  const clip = p.clips[clipId];
  if (!clip) return p;
  const limit = sourceLimit(p, clip);
  // duration*speed source frames are consumed, so max timeline duration scales
  // inversely with speed.
  const maxDuration =
    limit === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : Math.floor((limit - clip.sourceInFrame) / clip.speed);
  let duration = Math.round(newEndFrame) - clip.startFrame;
  duration = Math.max(1, duration);
  if (duration > maxDuration) duration = maxDuration;
  if (duration === clip.durationInFrames) return p;
  return recompute(putClip(p, { ...clip, durationInFrames: duration }));
}

/** Set a clip's on-timeline duration directly (e.g. an image's display length). */
export function setClipDuration(p: Project, clipId: ClipId, duration: Frames): Project {
  const clip = p.clips[clipId];
  if (!clip) return p;
  return trimClipEnd(p, clipId, clip.startFrame + Math.max(1, Math.round(duration)));
}

/**
 * Set a video/audio clip's playback speed. The clip keeps the SAME source
 * content, so its timeline length scales inversely (2× → half as long).
 */
export function setClipSpeed(p: Project, clipId: ClipId, newSpeed: number): Project {
  const clip = p.clips[clipId];
  if (!clip || clip.kind === 'image') return p; // a still has no playback speed
  const speed = Math.max(0.1, Math.min(8, newSpeed));
  if (speed === clip.speed) return p;
  const sourceContent = clip.durationInFrames * clip.speed; // invariant across speed
  let duration = Math.max(1, Math.round(sourceContent / speed));
  const limit = sourceLimit(p, clip);
  if (limit !== Number.POSITIVE_INFINITY) {
    const maxDur = Math.floor((limit - clip.sourceInFrame) / speed);
    if (duration > maxDur) duration = Math.max(1, maxDur);
  }
  const next = putClip(p, { ...clip, speed, durationInFrames: duration });
  return recompute(sortTrack(next, clip.trackId));
}

/**
 * Split a clip at timeline frame `atFrame` into two abutting clips. The new
 * right-hand clip uses `rightClipId` (generated by the caller). No-op if the
 * cut is not strictly inside the clip.
 */
export function splitClip(
  p: Project,
  clipId: ClipId,
  atFrame: Frames,
  rightClipId: ClipId,
): Project {
  const clip = p.clips[clipId];
  if (!clip) return p;
  const start = clip.startFrame;
  const end = clip.startFrame + clip.durationInFrames;
  const cut = Math.round(atFrame);
  if (cut <= start || cut >= end) return p; // must be strictly inside

  const leftDuration = cut - start;
  const left: Clip = { ...clip, durationInFrames: leftDuration };
  const right: Clip = {
    ...clip,
    id: rightClipId,
    startFrame: cut,
    durationInFrames: end - cut,
    sourceInFrame: clip.sourceInFrame + leftDuration,
    effectIds: [], // clip-scoped effects stay with the left half
  };
  let next = putClip(p, left);
  next = insertClip(next, right);
  return next;
}

// --- tracks -----------------------------------------------------------------

/**
 * Insert a track. Video tracks go to the TOP of the stack (front of
 * trackOrder), audio tracks to the bottom — matching the usual editor layout
 * where new video layers sit above and audio rows accumulate below.
 */
export function insertTrack(p: Project, track: Track, position: 'top' | 'bottom'): Project {
  const trackOrder =
    position === 'top' ? [track.id, ...p.trackOrder] : [...p.trackOrder, track.id];
  return { ...p, tracks: { ...p.tracks, [track.id]: track }, trackOrder };
}

/** Remove a track and all clips on it. */
export function removeTrack(p: Project, trackId: TrackId): Project {
  const track = p.tracks[trackId];
  if (!track) return p;
  const clips = { ...p.clips };
  for (const cid of track.clipOrder) delete clips[cid];
  const tracks = { ...p.tracks };
  delete tracks[trackId];
  return recompute({
    ...p,
    clips,
    tracks,
    trackOrder: p.trackOrder.filter((id) => id !== trackId),
  });
}

/** Resize the project canvas (aspect-ratio / resolution presets). */
export function setCanvasSize(p: Project, width: number, height: number): Project {
  return { ...p, width: Math.max(2, Math.round(width)), height: Math.max(2, Math.round(height)) };
}

/** Mute/unmute a track (audio excluded from playback + export). */
export function toggleTrackMuted(p: Project, trackId: TrackId): Project {
  const t = p.tracks[trackId];
  if (!t) return p;
  return { ...p, tracks: { ...p.tracks, [trackId]: { ...t, muted: !t.muted } } };
}

/** Show/hide a track (hidden video excluded from the picture). */
export function toggleTrackHidden(p: Project, trackId: TrackId): Project {
  const t = p.tracks[trackId];
  if (!t) return p;
  return { ...p, tracks: { ...p.tracks, [trackId]: { ...t, hidden: !t.hidden } } };
}

export function setProjectName(p: Project, name: string): Project {
  return { ...p, name };
}

export function setFps(p: Project, fps: number): Project {
  return { ...p, fps: Math.max(1, Math.round(fps)) };
}

/** Set the letterbox/background color. */
export function setBackground(p: Project, color: string): Project {
  return { ...p, background: color };
}

/** Set an audio clip's volume (linear gain, >= 0). */
export function setClipGain(p: Project, clipId: ClipId, gain: number): Project {
  const clip = p.clips[clipId];
  if (!clip || clip.kind !== 'audio') return p;
  return { ...p, clips: { ...p.clips, [clipId]: { ...clip, gain: Math.max(0, gain) } } };
}

/** Toggle whether an audio clip ducks under "voice" (other non-ducked audio). */
export function setClipDuck(p: Project, clipId: ClipId, duck: boolean): Project {
  const clip = p.clips[clipId];
  if (!clip || clip.kind !== 'audio') return p;
  return { ...p, clips: { ...p.clips, [clipId]: { ...clip, duck } } };
}

/** Set a clip's fade in/out (frames), clamped so the two never exceed its length. */
export function setClipFade(
  p: Project,
  clipId: ClipId,
  patch: { fadeInFrames?: number; fadeOutFrames?: number },
): Project {
  const clip = p.clips[clipId];
  if (!clip) return p;
  const dur = clip.durationInFrames;
  const fadeIn = clampFrame(Math.round(patch.fadeInFrames ?? clip.fadeInFrames), 0, dur);
  const fadeOut = clampFrame(Math.round(patch.fadeOutFrames ?? clip.fadeOutFrames), 0, dur - fadeIn);
  return { ...p, clips: { ...p.clips, [clipId]: { ...clip, fadeInFrames: fadeIn, fadeOutFrames: fadeOut } } };
}

// --- effects ----------------------------------------------------------------

export function insertEffect(p: Project, effect: Effect): Project {
  return { ...p, effects: { ...p.effects, [effect.id]: effect } };
}

export function updateEffect(p: Project, effectId: EffectId, patch: Partial<Effect>): Project {
  const effect = p.effects[effectId];
  if (!effect) return p;
  // Patch is constrained by the union; spread is safe because we keep `type`.
  const merged = { ...effect, ...patch, id: effect.id, type: effect.type } as Effect;
  return { ...p, effects: { ...p.effects, [effectId]: merged } };
}

export function removeEffect(p: Project, effectId: EffectId): Project {
  if (!p.effects[effectId]) return p;
  const effects = { ...p.effects };
  delete effects[effectId];
  return { ...p, effects };
}

// --- overlay timing (timeline lanes) ---------------------------------------
// Overlays carry their own `timing` range, independent of any clip. These three
// mirror the clip move/trim reducers but on `effect.timing`. Overlays have no
// source bound, so length is limited only by start >= 0 and duration >= 1.

function putEffectTiming(
  p: Project,
  effectId: EffectId,
  timing: { start: Frames; duration: Frames },
): Project {
  const eff = p.effects[effectId];
  return { ...p, effects: { ...p.effects, [effectId]: { ...eff, timing } } };
}

/** Move a timed overlay to a new start frame (clamped >= 0); duration unchanged. */
export function moveEffect(p: Project, effectId: EffectId, newStart: Frames): Project {
  const eff = p.effects[effectId];
  if (!eff) return p;
  const start = Math.max(0, Math.round(newStart));
  if (start === eff.timing.start) return p;
  return putEffectTiming(p, effectId, { start, duration: eff.timing.duration });
}

/** Drag the LEFT edge: the end stays put, start + duration change (duration >= 1). */
export function trimEffectStart(p: Project, effectId: EffectId, newStart: Frames): Project {
  const eff = p.effects[effectId];
  if (!eff) return p;
  const end = eff.timing.start + eff.timing.duration;
  const start = clampFrame(Math.round(newStart), 0, end - 1);
  if (start === eff.timing.start) return p;
  return putEffectTiming(p, effectId, { start, duration: end - start });
}

/** Drag the RIGHT edge: the start stays put, only duration changes (duration >= 1). */
export function trimEffectEnd(p: Project, effectId: EffectId, newEnd: Frames): Project {
  const eff = p.effects[effectId];
  if (!eff) return p;
  const duration = Math.max(1, Math.round(newEnd) - eff.timing.start);
  if (duration === eff.timing.duration) return p;
  return putEffectTiming(p, effectId, { start: eff.timing.start, duration });
}

// --- convenience used by actions -------------------------------------------

/**
 * Build (but do not insert) a clip from a media asset, placed at `startFrame`
 * on `track`. The caller supplies the id. Duration defaults to the media's
 * natural length (images get a default still length).
 */
export function makeClipFromMedia(
  p: Project,
  args: { id: ClipId; mediaId: Project['media'][string]['id']; track: Track; startFrame: Frames },
): Clip | undefined {
  const media = getMedia(p, args.mediaId);
  if (!media) return undefined;
  const base = {
    id: args.id,
    trackId: args.track.id,
    mediaId: args.mediaId,
    startFrame: Math.max(0, Math.round(args.startFrame)),
    durationInFrames: media.durationInFrames,
    sourceInFrame: 0,
    speed: 1,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    effectIds: [] as EffectId[],
  };
  if (args.track.kind === 'audio') {
    if (media.kind !== 'audio') return undefined;
    return { ...base, kind: 'audio', gain: 1, duck: false };
  }
  // video track accepts images and videos
  if (media.kind === 'audio') return undefined;
  const transform = containedBox(
    media.width ?? p.width,
    media.height ?? p.height,
    p.width,
    p.height,
  );
  return {
    ...base,
    kind: media.kind,
    transform,
    transition: 'dissolve',
    motion: 'none',
    adjust: { brightness: 1, contrast: 1, saturate: 1 },
  };
}

/**
 * Refit a visual clip's destination box to the canvas: contain (letterbox),
 * cover (crop to fill), or stretch (exact, ignores aspect). Keeps opacity.
 */
export function fitClip(p: Project, clipId: ClipId, mode: FitMode): Project {
  const clip = p.clips[clipId];
  if (!clip || clip.kind === 'audio') return p;
  const media = p.media[clip.mediaId];
  const sw = media?.width ?? clip.transform.width;
  const sh = media?.height ?? clip.transform.height;
  const opacity = clip.transform.opacity;
  let box: Transform;
  if (mode === 'stretch') {
    box = { x: 0, y: 0, width: p.width, height: p.height, opacity };
  } else {
    const fit = mode === 'cover' ? coverBox : containedBox;
    box = { ...fit(sw, sh, p.width, p.height), opacity };
  }
  return { ...p, clips: { ...p.clips, [clipId]: { ...clip, transform: box } } };
}

/** Clone a clip onto the END of its track (no overlap), with a new id. */
export function duplicateClip(p: Project, clipId: ClipId, newId: ClipId): Project {
  const clip = p.clips[clipId];
  if (!clip) return p;
  const track = p.tracks[clip.trackId];
  if (!track) return p;
  const trackEnd = track.clipOrder.reduce((max, cid) => {
    const c = p.clips[cid];
    return c ? Math.max(max, c.startFrame + c.durationInFrames) : max;
  }, 0);
  const copy: Clip = { ...clip, id: newId, startFrame: trackEnd, effectIds: [...clip.effectIds] };
  return insertClip(p, copy);
}

/** Clone an overlay with a new id, nudged so it isn't exactly atop the original. */
export function duplicateEffect(p: Project, effectId: EffectId, newId: EffectId): Project {
  const eff = p.effects[effectId];
  if (!eff) return p;
  let copy: Effect;
  if (eff.type === 'text') copy = { ...eff, id: newId, x: eff.x + 20, y: eff.y + 20 };
  else if (eff.type === 'shape') copy = { ...eff, id: newId, x: eff.x + 20, y: eff.y + 20 };
  else if (eff.type === 'image') copy = { ...eff, id: newId, x: eff.x + 20, y: eff.y + 20 };
  else copy = { ...eff, id: newId };
  return { ...p, effects: { ...p.effects, [newId]: copy } };
}

/** Set a video/image clip's transition-in style. */
export function setClipTransition(
  p: Project,
  clipId: ClipId,
  transition: VideoClip['transition'],
): Project {
  const clip = p.clips[clipId];
  if (!clip || clip.kind === 'audio') return p;
  return { ...p, clips: { ...p.clips, [clipId]: { ...clip, transition } } };
}

/** Set a video/image clip's Ken Burns pan/zoom motion. */
export function setClipMotion(p: Project, clipId: ClipId, motion: VideoClip['motion']): Project {
  const clip = p.clips[clipId];
  if (!clip || clip.kind === 'audio') return p;
  return { ...p, clips: { ...p.clips, [clipId]: { ...clip, motion } } };
}

/** Patch a clip's color adjustment (brightness/contrast/saturate). */
export function setClipAdjust(
  p: Project,
  clipId: ClipId,
  patch: Partial<VideoClip['adjust']>,
): Project {
  const clip = p.clips[clipId];
  if (!clip || clip.kind === 'audio') return p;
  return {
    ...p,
    clips: { ...p.clips, [clipId]: { ...clip, adjust: { ...clip.adjust, ...patch } } },
  };
}

/** True if a media asset can be dropped onto a track of the given kind. */
export function mediaFitsTrack(media: MediaAsset, track: Track): boolean {
  if (track.kind === 'audio') return media.kind === 'audio';
  return media.kind === 'image' || media.kind === 'video';
}

// re-export for callers that only import edits
export { isVideoClip };
