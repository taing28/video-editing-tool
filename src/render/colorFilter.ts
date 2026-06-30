/**
 * render/colorFilter — CSS-filter color grading, shared by preview AND export.
 *
 * Both renderers resolve the SAME filtered <canvas> from `getFilteredCanvas`
 * (cached), so the graded image is pixel-identical in the preview and the
 * exported file — parity by construction, no per-renderer filter math.
 */
import type { ColorAdjust } from '../core/model';

export const NEUTRAL_ADJUST: ColorAdjust = { brightness: 1, contrast: 1, saturate: 1 };

export function isNeutralAdjust(a: ColorAdjust): boolean {
  return a.brightness === 1 && a.contrast === 1 && a.saturate === 1;
}

export function filterString(a: ColorAdjust): string {
  return `brightness(${a.brightness}) contrast(${a.contrast}) saturate(${a.saturate})`;
}

const cache = new Map<string, HTMLCanvasElement>();
const MAX_CACHE = 48;

// Reusable per-clip canvases for DYNAMIC sources (video): the frame changes
// every seek, so caching by content is wrong. We keep ONE stable canvas per
// (clip, size) and repaint it on every call — stable identity matters so the
// Konva preview can keep the same image node and just redraw its pixels.
const scratch = new Map<string, HTMLCanvasElement>();
const MAX_SCRATCH = 12;

/**
 * Draw `source` into a canvas with the color filter applied. Returns the source
 * unchanged for a neutral adjust.
 *
 * - STATIC (images): cached by (key, filter, size) — computed once.
 * - DYNAMIC (video, `dynamic=true`): a stable per-(key,size) canvas, repainted
 *   from the source's CURRENT frame on every call (callers draw it immediately).
 *
 * Both the preview and the export call this, so a graded clip is identical in
 * the preview and the exported file.
 */
export function getFilteredCanvas(
  key: string,
  source: CanvasImageSource,
  width: number,
  height: number,
  adjust: ColorAdjust,
  dynamic = false,
): CanvasImageSource {
  if (isNeutralAdjust(adjust)) return source;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  if (dynamic) {
    const sKey = `${key}:${w}x${h}`;
    let canvas = scratch.get(sKey);
    if (!canvas) {
      canvas = document.createElement('canvas');
      scratch.set(sKey, canvas);
      if (scratch.size > MAX_SCRATCH) {
        const oldest = scratch.keys().next().value;
        if (oldest) scratch.delete(oldest);
      }
    }
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, w, h);
      ctx.filter = filterString(adjust);
      ctx.drawImage(source, 0, 0, w, h);
      ctx.filter = 'none';
    }
    return canvas;
  }

  const cacheKey = `${key}:${filterString(adjust)}:${w}x${h}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.filter = filterString(adjust);
    ctx.drawImage(source, 0, 0, w, h);
  }
  cache.set(cacheKey, canvas);
  if (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return canvas;
}
