/**
 * core/model — the timeline document.
 *
 * Two principles make this scalable:
 *  1. NORMALIZED & FLAT — entities are stored in id-keyed maps, and parents
 *     reference children by id + an explicit order array. No deep nesting, so
 *     any entity is O(1) to find and update.
 *  2. PURE DATA — a Project is plain JSON (no class instances, no DOM objects,
 *     no functions). That makes save/load, undo (snapshots), and the
 *     `(doc, frame) -> pixels` render contract trivial.
 */
import type { FrameRange, Frames } from './time';
import type { ClipId, EffectId, MediaId, ProjectId, TrackId } from './ids';
import { newProjectId, newTrackId } from './ids';

// ---------------------------------------------------------------------------
// Media — the raw assets the user imports. Pixels/samples live in the media
// registry (runtime, not serialized); this is just the metadata + a src ref.
// ---------------------------------------------------------------------------

export type MediaKind = 'image' | 'video' | 'audio';

export interface MediaAsset {
  id: MediaId;
  kind: MediaKind;
  name: string;
  /** Object URL (runtime) or persisted path/URL. */
  src: string;
  /** Natural duration of the source in frames (images get a sensible default). */
  durationInFrames: Frames;
  /** Pixel dimensions for image/video. */
  width?: number;
  height?: number;
  /** Audio sample rate, when known. */
  sampleRate?: number;
}

// ---------------------------------------------------------------------------
// Clips — an instance of a media asset placed on a track.
//   move          -> change startFrame
//   change length -> change durationInFrames
//   trim left     -> change sourceInFrame AND startFrame AND durationInFrames
//   trim right    -> change durationInFrames
//   split         -> clone into two clips with adjusted source/start/duration
// ---------------------------------------------------------------------------

export interface BaseClip {
  id: ClipId;
  trackId: TrackId;
  mediaId: MediaId;
  /** Position of the clip's first frame ON the timeline. */
  startFrame: Frames;
  /** How many frames the clip occupies on the timeline. Invariant: >= 1. */
  durationInFrames: Frames;
  /** Offset of the clip's first frame INTO the source media (the trim point). */
  sourceInFrame: Frames;
  /** Playback speed (1 = normal, 2 = double, 0.5 = slow-mo). Source frames
   * consumed per timeline frame = `speed`. Meaningful for video/audio only. */
  speed: number;
  /** Ramp from 0 over this many frames at the clip's start (0 = no fade). */
  fadeInFrames: Frames;
  /** Ramp to 0 over this many frames at the clip's end (0 = no fade). */
  fadeOutFrames: Frames;
  /** Effects scoped to this clip. Global overlays live on Project. */
  effectIds: EffectId[];
}

/** How a clip transitions in when it overlaps the previous clip on its track. */
export type TransitionType = 'dissolve' | 'wipe' | 'slide';

/** Ken Burns pan/zoom motion applied over a clip's duration. */
export type KenBurns = 'none' | 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight';

/** Color grading (CSS-filter multipliers; 1 = unchanged). */
export interface ColorAdjust {
  brightness: number;
  contrast: number;
  saturate: number;
}

export interface VideoClip extends BaseClip {
  kind: 'image' | 'video';
  /** Destination box (project pixels) + opacity; set to a contained box on add. */
  transform: Transform;
  /** Transition style used across an overlap with the previous clip. */
  transition: TransitionType;
  /** Animated pan/zoom over the clip's duration. */
  motion: KenBurns;
  /** Color grading (applied to image clips). */
  adjust: ColorAdjust;
}

export interface AudioClip extends BaseClip {
  kind: 'audio';
  /** Linear gain multiplier (1 = unchanged). */
  gain: number;
  /** Auto-lower this clip while other (non-ducked) audio — "voice" — is playing. */
  duck: boolean;
}

export type Clip = VideoClip | AudioClip;

export interface Transform {
  /** Top-left of the destination box in project pixels. */
  x: number;
  y: number;
  /** Destination box size in project pixels. */
  width: number;
  height: number;
  /** 0..1 */
  opacity: number;
}

/** How a visual clip's media maps into the canvas frame. */
export type FitMode = 'contain' | 'cover' | 'stretch';

/**
 * The "contain" box: fit (sw×sh) inside (dw×dh) preserving aspect, centered.
 * Used to give a freshly-added clip a sensible starting transform.
 */
export function containedBox(
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Transform {
  const base = sw > 0 && sh > 0 ? Math.min(dw / sw, dh / sh) : 1;
  const width = sw * base;
  const height = sh * base;
  return { x: (dw - width) / 2, y: (dh - height) / 2, width, height, opacity: 1 };
}

/**
 * The "cover" box: scale (sw×sh) to FILL (dw×dh) preserving aspect, centered —
 * the media overflows the frame on one axis and is cropped to the canvas by the
 * renderer. The reframing creators want for landscape media in a vertical canvas.
 */
export function coverBox(
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Transform {
  const base = sw > 0 && sh > 0 ? Math.max(dw / sw, dh / sh) : 1;
  const width = sw * base;
  const height = sh * base;
  return { x: (dw - width) / 2, y: (dh - height) / 2, width, height, opacity: 1 };
}

// ---------------------------------------------------------------------------
// Effects — an EXTENSIBLE discriminated union. Text is just the first member.
// Adding `fade`, `lowerThird`, etc. later means adding a variant here and a
// renderer for it — the engine itself doesn't change.
// ---------------------------------------------------------------------------

export interface BaseEffect {
  id: EffectId;
  /** Discriminator. */
  type: string;
  /** When the effect is active, in timeline frames — independent of any clip. */
  timing: FrameRange;
  /** Opacity ramp-in over this many frames at the start of `timing` (0 = none). */
  fadeInFrames?: Frames;
  /** Opacity ramp-out over this many frames at the end of `timing` (0 = none). */
  fadeOutFrames?: Frames;
}

export interface TextEffect extends BaseEffect {
  type: 'text';
  text: string;
  fontSize: number;
  /** Numeric weight 100..900 (mapped to the renderer's font style). */
  fontWeight: number;
  fontFamily: string;
  color: string;
  /** Anchor position in project pixels. */
  x: number;
  y: number;
  align: 'left' | 'center' | 'right';
}

export interface CaptionEffect extends BaseEffect {
  type: 'caption';
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
}

export interface ShapeEffect extends BaseEffect {
  type: 'shape';
  /** Box in project pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
}

/** Union of all effect variants. Extend this as new effect types are added. */
export type Effect = TextEffect | CaptionEffect | ShapeEffect;

// ---------------------------------------------------------------------------
// Tracks & Project
// ---------------------------------------------------------------------------

export type TrackKind = 'video' | 'audio';

export interface Track {
  id: TrackId;
  kind: TrackKind;
  name: string;
  /** Clip order (left-to-right). For video tracks this is also paint order. */
  clipOrder: ClipId[];
  muted: boolean;
  hidden: boolean;
}

export interface Project {
  id: ProjectId;
  name: string;
  /** Frames per second. The denominator behind every frame number. */
  fps: number;
  /** Output canvas size in pixels. */
  width: number;
  height: number;
  /** Total timeline length in frames (derived from content, cached here). */
  durationInFrames: Frames;
  /** Solid fill behind all visual clips (letterbox color). */
  background: string;
  /** Track render/stacking order: index 0 is the BOTTOM (drawn first). */
  trackOrder: TrackId[];
  tracks: Record<string, Track>;
  clips: Record<string, Clip>;
  media: Record<string, MediaAsset>;
  /** Global timed overlays (text, etc.), keyed by id. */
  effects: Record<string, Effect>;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export interface NewProjectOptions {
  name?: string;
  fps?: number;
  width?: number;
  height?: number;
}

/**
 * Create an empty project with one video track ("Video") and one audio track
 * ("Audio") — matching the requested layout (row 1 = images/video, rows below
 * = audio). Video track is drawn on top of audio in trackOrder terms but audio
 * is non-visual; order here is mostly about visual tracks.
 */
export function createEmptyProject(opts: NewProjectOptions = {}): Project {
  const id = newProjectId();
  const videoTrack: Track = {
    id: newTrackId(),
    kind: 'video',
    name: 'Video',
    clipOrder: [],
    muted: false,
    hidden: false,
  };
  const audioTrack: Track = {
    id: newTrackId(),
    kind: 'audio',
    name: 'Audio',
    clipOrder: [],
    muted: false,
    hidden: false,
  };
  return {
    id,
    name: opts.name ?? 'Untitled project',
    fps: opts.fps ?? 30,
    width: opts.width ?? 1920,
    height: opts.height ?? 1080,
    durationInFrames: 0,
    background: '#000000',
    // Video first so it is the bottom visual track; extra video tracks added
    // later stack above it.
    trackOrder: [videoTrack.id, audioTrack.id],
    tracks: { [videoTrack.id]: videoTrack, [audioTrack.id]: audioTrack },
    clips: {},
    media: {},
    effects: {},
  };
}

// ---------------------------------------------------------------------------
// Tiny typed accessors (kept here to avoid `as` casts at call sites)
// ---------------------------------------------------------------------------

export const getTrack = (p: Project, id: TrackId): Track | undefined => p.tracks[id];
export const getClip = (p: Project, id: ClipId): Clip | undefined => p.clips[id];
export const getMedia = (p: Project, id: MediaId): MediaAsset | undefined => p.media[id];
export const getEffect = (p: Project, id: EffectId): Effect | undefined => p.effects[id];

export const isVideoClip = (c: Clip): c is VideoClip => c.kind === 'image' || c.kind === 'video';
export const isAudioClip = (c: Clip): c is AudioClip => c.kind === 'audio';
