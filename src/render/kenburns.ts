/**
 * render/kenburns — Ken Burns pan/zoom as a pure box animation.
 *
 * Given a clip's base destination box and a progress (0..1 through the clip),
 * returns the animated box. Because it's just a box, BOTH renderers (preview +
 * export) draw it with no special-casing — no clip masks, no parity gymnastics.
 */
import type { KenBurns, Transform } from '../core/model';

const ZOOM = 1.12; // peak zoom for zoomIn/zoomOut
const PAN_ZOOM = 1.1; // slight zoom so panning has room
const PAN_FRACTION = 0.06; // horizontal travel as a fraction of width

/** Scale a box around its center, preserving opacity. */
function scaled(base: Transform, s: number): Transform {
  const width = base.width * s;
  const height = base.height * s;
  return {
    x: base.x - (width - base.width) / 2,
    y: base.y - (height - base.height) / 2,
    width,
    height,
    opacity: base.opacity,
  };
}

export function kenBurnsBox(base: Transform, motion: KenBurns, progress: number): Transform {
  const p = Math.max(0, Math.min(1, progress));
  const lerp = (a: number, b: number) => a + (b - a) * p;
  switch (motion) {
    case 'zoomIn':
      return scaled(base, lerp(1, ZOOM));
    case 'zoomOut':
      return scaled(base, lerp(ZOOM, 1));
    case 'panLeft':
    case 'panRight': {
      const box = scaled(base, PAN_ZOOM);
      const off = base.width * PAN_FRACTION;
      const dx = motion === 'panLeft' ? lerp(off, -off) : lerp(-off, off);
      return { ...box, x: box.x + dx };
    }
    default:
      return base;
  }
}
