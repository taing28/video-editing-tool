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

/**
 * Draw `source` into a canvas with the color filter applied, cached by
 * (key, filter, size). Returns the source unchanged for a neutral adjust.
 */
export function getFilteredCanvas(
  key: string,
  source: CanvasImageSource,
  width: number,
  height: number,
  adjust: ColorAdjust,
): CanvasImageSource {
  if (isNeutralAdjust(adjust)) return source;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
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
