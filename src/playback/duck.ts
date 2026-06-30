/**
 * playback/duck — auto-duck a clip's volume under "voice".
 *
 * Given the voice intervals (timeline seconds) and a ducked clip's playback
 * window, `computeDuckRamps` returns a 1 ↔ duckLevel envelope (pure, tested);
 * `scheduleDuck` applies it to a gain param, holding then quickly ramping at
 * each boundary so the duck is a fast dip rather than a slow slide.
 */
export const DUCK_LEVEL = 0.28; // ~ -11 dB while voice plays
const RAMP = 0.12; // seconds for each duck transition

export interface DuckRamp {
  /** Seconds from the window start. */
  atSec: number;
  level: number;
}

export function computeDuckRamps(
  windowStartSec: number,
  windowEndSec: number,
  intervalsSec: Array<[number, number]>,
  duckLevel: number,
): { start: number; ramps: DuckRamp[] } {
  const inVoice = (t: number) => intervalsSec.some(([s, e]) => t >= s && t < e);
  const start = inVoice(windowStartSec + 1e-6) ? duckLevel : 1;
  const ramps: DuckRamp[] = [];
  for (const [s, e] of intervalsSec) {
    if (s > windowStartSec && s < windowEndSec) ramps.push({ atSec: s - windowStartSec, level: duckLevel });
    if (e > windowStartSec && e < windowEndSec) ramps.push({ atSec: e - windowStartSec, level: 1 });
  }
  ramps.sort((a, b) => a.atSec - b.atSec);
  return { start, ramps };
}

export function scheduleDuck(
  param: AudioParam,
  ctxWhen: number,
  windowStartSec: number,
  windowEndSec: number,
  intervalsSec: Array<[number, number]>,
  duckLevel: number,
): void {
  const { start, ramps } = computeDuckRamps(windowStartSec, windowEndSec, intervalsSec, duckLevel);
  param.setValueAtTime(start, ctxWhen);
  let prev = start;
  for (const r of ramps) {
    const at = ctxWhen + r.atSec;
    param.setValueAtTime(prev, Math.max(ctxWhen, at - RAMP));
    param.linearRampToValueAtTime(r.level, at);
    prev = r.level;
  }
}
