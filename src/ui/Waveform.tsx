/**
 * ui/Waveform — draws an audio clip's waveform on its timeline block.
 *
 * Decodes the clip's audio once (cached in the media registry), samples peaks
 * over the clip's trimmed source range, and paints them to a canvas sized to
 * the clip. Re-renders when the clip is trimmed/moved or the zoom changes.
 */
import { useEffect, useRef } from 'react';
import type { AudioClip } from '../core/model';
import { getAudioBuffer } from '../media/registry';

let decodeCtx: AudioContext | null = null;
function ctx(): AudioContext {
  if (!decodeCtx) decodeCtx = new AudioContext();
  return decodeCtx;
}

/**
 * Cap on the canvas's intrinsic (backing-store) width. A long clip's display
 * width can run to tens of thousands of pixels, which exceeds the browser's max
 * canvas size — the allocation then fails and the canvas renders the broken-image
 * placeholder. We draw into a capped backing store and let CSS (`width: 100%`)
 * stretch it across the clip block: a very long clip just gets a lower-res
 * waveform instead of a broken one.
 */
const MAX_WAVEFORM_PX = 4096;

function computePeaks(
  data: Float32Array,
  rate: number,
  startSec: number,
  durationSec: number,
  bins: number,
): number[] {
  const start = Math.max(0, Math.floor(startSec * rate));
  const end = Math.min(data.length, Math.floor((startSec + durationSec) * rate));
  const span = Math.max(1, end - start);
  const per = Math.max(1, Math.floor(span / bins));
  const peaks: number[] = [];
  for (let b = 0; b < bins; b++) {
    let max = 0;
    const s = start + b * per;
    for (let i = 0; i < per && s + i < end; i++) {
      const v = Math.abs(data[s + i]);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  return peaks;
}

export function Waveform({
  clip,
  pxPerFrame,
  fps,
}: {
  clip: AudioClip;
  pxPerFrame: number;
  fps: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const buffer = await getAudioBuffer(clip.mediaId, ctx());
      if (cancelled || !buffer) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      // Display width follows the clip; the backing store is capped so a very
      // long clip can't blow past the browser's max canvas size (see above).
      const displayWidth = Math.max(1, Math.round(clip.durationInFrames * pxPerFrame));
      const width = Math.min(displayWidth, MAX_WAVEFORM_PX);
      const height = canvas.height;
      canvas.width = width;
      const c2d = canvas.getContext('2d');
      if (!c2d) return;

      const bins = Math.max(1, Math.floor(width / 2));
      const peaks = computePeaks(
        buffer.getChannelData(0),
        buffer.sampleRate,
        clip.sourceInFrame / fps,
        clip.durationInFrames / fps,
        bins,
      );

      c2d.clearRect(0, 0, width, height);
      c2d.fillStyle = 'rgba(255,255,255,0.55)';
      const mid = height / 2;
      const step = width / bins;
      for (let i = 0; i < bins; i++) {
        const h = Math.max(1, peaks[i] * (height - 4));
        c2d.fillRect(i * step, mid - h / 2, Math.max(1, step - 1), h);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clip.mediaId, clip.sourceInFrame, clip.durationInFrames, pxPerFrame, fps]);

  return <canvas ref={canvasRef} className="waveform" height={44} />;
}
