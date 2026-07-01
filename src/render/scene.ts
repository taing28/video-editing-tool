/**
 * render/scene — the single render path seam.
 *
 * `buildScene(project, frame, resolve)` is a PURE description of everything that
 * should be drawn at one frame: an ordered list of layers with absolute,
 * project-pixel geometry. It contains no drawing code and no framework types.
 *
 * Both renderers consume it:
 *   - the live PREVIEW renders a Scene with react-konva (gets drag/transform
 *     handles for free), and
 *   - the future EXPORT renders the SAME Scene imperatively to a Canvas2D /
 *     OffscreenCanvas, frame by frame.
 * Because they share buildScene, text overlays and future effects appear in the
 * export with zero special-casing.
 */
import type { Project, ColorAdjust } from '../core/model';
import type { Frames } from '../core/time';
import { isNeutralAdjust } from './colorFilter';
import {
  getActiveVideoClips,
  getActiveEffects,
  fadeEnvelope,
  effectOpacity,
  overlapWithPrev,
  captionWords,
  activeCaptionWordIndex,
} from '../core/selectors';
import { kenBurnsBox } from './kenburns';
import type { MediaId } from '../core/ids';

/** What the media registry hands back for a loaded asset. */
export interface ResolvedMedia {
  /** A drawable for image/video sources (already loaded). */
  drawable?: CanvasImageSource;
  naturalWidth?: number;
  naturalHeight?: number;
}

export type ResolveMedia = (id: MediaId) => ResolvedMedia | undefined;

export interface ImageLayer {
  kind: 'image';
  clipId: string;
  drawable: CanvasImageSource;
  /** Destination rect in project pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  /** Geometric transition-in across an overlap (dissolve is folded into opacity). */
  transition?: { type: 'wipe' | 'slide'; progress: number };
  /** Color grading to apply. */
  adjust?: ColorAdjust;
  /** The source frame changes per playhead (video) → don't cache the graded canvas. */
  dynamic?: boolean;
}

export interface TextLayer {
  kind: 'text';
  effectId: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  color: string;
  align: 'left' | 'center' | 'right';
  /** 0..1 fade envelope from the effect's fadeIn/fadeOut. */
  opacity: number;
}

export interface CaptionLayer {
  kind: 'caption';
  effectId: string;
  /** Pre-split lines (on \n); centered + bottom-anchored by the renderer. */
  lines: string[];
  fontSize: number;
  fontFamily: string;
  color: string;
  /** 0..1 fade envelope from the effect's fadeIn/fadeOut. */
  opacity: number;
  /** Karaoke: the flat word list; when present, renderers highlight one word. */
  words?: string[];
  /** Karaoke: index of the currently-spoken word (-1 = none). */
  activeWordIndex?: number;
  /** Karaoke: color of the active word. */
  highlightColor?: string;
}

export interface ShapeLayer {
  kind: 'shape';
  effectId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
}

/** An image overlay (e.g. a character cut-out) drawn on top of the clips. */
export interface ImageOverlayLayer {
  kind: 'imageOverlay';
  effectId: string;
  drawable: CanvasImageSource;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

export type SceneLayer =
  | ImageLayer
  | TextLayer
  | CaptionLayer
  | ShapeLayer
  | ImageOverlayLayer;

export interface Scene {
  width: number;
  height: number;
  background: string;
  /** Bottom-to-top paint order. */
  layers: SceneLayer[];
}

export function buildScene(
  project: Project,
  frame: Frames,
  resolve: ResolveMedia,
  /** Clip to render at its base box (no Ken Burns) — i.e. the one being edited. */
  freezeMotionFor?: string,
): Scene {
  const layers: SceneLayer[] = [];

  // Visual clips, bottom-to-top. Geometry comes straight from the clip's
  // transform box (set on add, edited by dragging/resizing on the preview).
  for (const { clip } of getActiveVideoClips(project, frame)) {
    const media = resolve(clip.mediaId);
    if (!media?.drawable) continue;
    // A same-track overlap with the previous clip is a transition (this clip
    // transitions IN over the overlap while the previous one plays underneath).
    const overlap = overlapWithPrev(project, clip);
    const into = frame - clip.startFrame;
    const inOverlap = overlap > 0 && into < overlap;
    const progress = inOverlap ? into / overlap : 1;
    // Manual fade in/out apply independently of the transition.
    const fade = fadeEnvelope(
      frame,
      clip.startFrame,
      clip.durationInFrames,
      clip.fadeInFrames,
      clip.fadeOutFrames,
    );
    let opacity = clip.transform.opacity * fade;
    let transition: ImageLayer['transition'];
    if (inOverlap) {
      if (clip.transition === 'dissolve') opacity *= progress;
      else transition = { type: clip.transition, progress };
    }
    // Ken Burns: animate the destination box over the clip (frozen while editing).
    const animate = clip.motion !== 'none' && clip.id !== freezeMotionFor;
    const box = animate
      ? kenBurnsBox(clip.transform, clip.motion, into / Math.max(1, clip.durationInFrames - 1))
      : clip.transform;
    const adjust = !isNeutralAdjust(clip.adjust) ? clip.adjust : undefined;
    layers.push({
      kind: 'image',
      clipId: clip.id,
      drawable: media.drawable,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      opacity,
      transition,
      adjust,
      dynamic: adjust && clip.kind === 'video' ? true : undefined,
    });
  }

  // Timed overlays on top. Each carries a fade envelope (0..1) folded into opacity.
  for (const effect of getActiveEffects(project, frame)) {
    const fade = effectOpacity(effect, frame);
    if (effect.type === 'text') {
      layers.push({
        kind: 'text',
        effectId: effect.id,
        text: effect.text,
        x: effect.x,
        y: effect.y,
        fontSize: effect.fontSize,
        fontWeight: effect.fontWeight,
        fontFamily: effect.fontFamily,
        color: effect.color,
        align: effect.align,
        opacity: fade,
      });
    } else if (effect.type === 'caption') {
      const karaoke = effect.karaoke
        ? {
            words: captionWords(effect).map((w) => w.text),
            activeWordIndex: activeCaptionWordIndex(effect, frame),
            highlightColor: effect.highlightColor ?? '#ffd400',
          }
        : {};
      layers.push({
        kind: 'caption',
        effectId: effect.id,
        lines: effect.text.split('\n'),
        fontSize: effect.fontSize,
        fontFamily: effect.fontFamily,
        color: effect.color,
        opacity: fade,
        ...karaoke,
      });
    } else if (effect.type === 'shape') {
      layers.push({
        kind: 'shape',
        effectId: effect.id,
        x: effect.x,
        y: effect.y,
        width: effect.width,
        height: effect.height,
        color: effect.color,
        opacity: effect.opacity * fade,
      });
    } else if (effect.type === 'image') {
      const media = resolve(effect.mediaId);
      if (!media?.drawable) continue; // not loaded → skip this frame
      layers.push({
        kind: 'imageOverlay',
        effectId: effect.id,
        drawable: media.drawable,
        x: effect.x,
        y: effect.y,
        width: effect.width,
        height: effect.height,
        opacity: effect.opacity * fade,
      });
    }
  }

  return {
    width: project.width,
    height: project.height,
    background: project.background ?? '#000000',
    layers,
  };
}

/**
 * Map a numeric font weight to a Konva/CSS fontStyle token. Konva's Text node
 * has no dedicated weight prop, so weight is expressed through fontStyle.
 */
export function weightToFontStyle(weight: number): string {
  // Konva accepts 'normal' | 'bold' | numeric strings like '700'.
  if (weight >= 600) return String(weight);
  return 'normal';
}
