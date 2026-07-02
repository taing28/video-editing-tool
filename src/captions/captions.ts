/**
 * captions/captions — turn the project's audio into caption effects.
 *
 * `mixProjectAudioMono16k` mixes all audio clips into the mono 16 kHz Float32
 * buffer Whisper expects. `segmentsToCaptions` is a PURE conversion from
 * transcript segments to caption effects (timing in frames) — unit-tested.
 */
import type { Project, CaptionEffect } from '../core/model';
import { isAudioClip } from '../core/model';
import { newEffectId } from '../core/ids';
import { secondsToFrames } from '../core/time';
import { getTracksInOrder, getTrackClips } from '../core/selectors';
import { getAudioBuffer } from '../media/registry';
import type { TranscriptSegment } from './transcribe';

const CAPTION_SAMPLE_RATE = 16000; // Whisper wants 16 kHz mono

export interface CaptionStyle {
  fontSize: number;
  fontFamily: string;
  color: string;
}

/** Pure: transcript segments → caption effects (timing converted to frames). */
export function segmentsToCaptions(
  segments: TranscriptSegment[],
  fps: number,
  style: CaptionStyle,
): CaptionEffect[] {
  return segments
    .filter((s) => s.text.trim().length > 0)
    .map((s) => {
      const startSec = Math.max(0, s.start);
      const start = secondsToFrames(startSec, fps);
      const duration = Math.max(1, secondsToFrames(Math.max(0.3, s.end - s.start), fps));
      // Speech-synced word timings (frame OFFSETS from the caption's start,
      // clamped into the caption window, each at least 1 frame long).
      const words = s.words?.length
        ? s.words.map((w) => {
            const ws = Math.max(0, secondsToFrames(w.start - startSec, fps));
            const we = Math.max(ws + 1, secondsToFrames(w.end - startSec, fps));
            return { text: w.text, start: Math.min(ws, duration - 1), end: Math.min(we, duration) };
          })
        : undefined;
      return {
        id: newEffectId(),
        type: 'caption' as const,
        timing: { start, duration },
        text: s.text.trim(),
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        color: style.color,
        // Auto-captions default to karaoke — each word lights up as it's spoken.
        karaoke: true,
        ...(words ? { words } : {}),
      };
    });
}

/** Mix all audio clips into one mono 16 kHz buffer, or null if there's no audio. */
export async function mixProjectAudioMono16k(project: Project): Promise<Float32Array | null> {
  const clips = [];
  for (const track of getTracksInOrder(project)) {
    if (track.kind !== 'audio') continue;
    for (const clip of getTrackClips(project, track.id)) {
      if (isAudioClip(clip)) clips.push(clip);
    }
  }
  if (clips.length === 0) return null;

  let maxEndFrame = 0;
  for (const c of clips) maxEndFrame = Math.max(maxEndFrame, c.startFrame + c.durationInFrames);
  const totalSeconds = maxEndFrame / project.fps;
  const length = Math.max(1, Math.ceil(totalSeconds * CAPTION_SAMPLE_RATE));
  const ctx = new OfflineAudioContext(1, length, CAPTION_SAMPLE_RATE);

  let scheduled = 0;
  for (const clip of clips) {
    const buffer = await getAudioBuffer(clip.mediaId, ctx);
    if (!buffer) continue;
    const node = ctx.createBufferSource();
    node.buffer = buffer; // resampled to 16 kHz on playback
    // Honor the clip's playback speed — otherwise a sped-up/slowed clip is
    // transcribed at the wrong rate and every caption lands at the wrong time.
    node.playbackRate.value = clip.speed;
    node.connect(ctx.destination);
    const when = clip.startFrame / project.fps;
    const offset = clip.sourceInFrame / project.fps;
    const timelineDur = clip.durationInFrames / project.fps;
    const available = Math.max(0, buffer.duration - offset);
    // At playbackRate `speed`, filling timelineDur needs speed× source seconds.
    node.start(when, offset, Math.min(timelineDur * clip.speed, available));
    scheduled++;
  }
  if (scheduled === 0) return null;

  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}
