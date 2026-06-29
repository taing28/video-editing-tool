/**
 * playback/audioFade — schedule a clip's gain automation (base volume + linear
 * fade in/out) on a Web Audio GainNode. Shared by the live preview engine and
 * the offline export mixdown so they fade identically.
 */
export function scheduleGainFade(
  param: AudioParam,
  /** ctx time at which the clip's audible portion begins. */
  when: number,
  /** the clip's base volume (linear gain). */
  baseGain: number,
  fadeInSec: number,
  fadeOutSec: number,
  /** full clip length on the timeline, in seconds. */
  durSec: number,
  /** how far into the clip we already are at `when` (0 when starting from the clip's head). */
  elapsedSec: number,
): void {
  const remainingIn = Math.max(0, fadeInSec - elapsedSec);
  const startVal = fadeInSec > 0 ? Math.min(1, elapsedSec / fadeInSec) * baseGain : baseGain;
  param.setValueAtTime(startVal, when);
  const inEnd = when + remainingIn;
  if (remainingIn > 0) param.linearRampToValueAtTime(baseGain, inEnd);

  if (fadeOutSec > 0) {
    const outStart = Math.max(inEnd, when + Math.max(0, durSec - fadeOutSec - elapsedSec));
    const outEnd = when + Math.max(0, durSec - elapsedSec);
    if (outEnd > outStart) {
      param.setValueAtTime(baseGain, outStart);
      param.linearRampToValueAtTime(0, outEnd);
    }
  }
}
