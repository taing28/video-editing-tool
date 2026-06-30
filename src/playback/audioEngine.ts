/**
 * playback/audioEngine — hear your audio tracks during preview playback.
 *
 * On play we schedule every audio clip on a single Web Audio `AudioContext`,
 * each `AudioBufferSourceNode` started at its timeline position with its trim
 * offset and gain. On pause/seek we stop them. This is preview only — the
 * EXPORT path mixes sample-accurately via OfflineAudioContext (see export.ts).
 *
 * Note: the visual clock stays on `performance.now` (see the store); audio runs
 * on the AudioContext clock. Tiny drift over a long preview is acceptable —
 * the exported file is the source of truth and is sample-accurate.
 */
import type { Project } from '../core/model';
import { isAudioClip } from '../core/model';
import { getTracksInOrder, getTrackClips } from '../core/selectors';
import { getAudioBuffer } from '../media/registry';
import { scheduleGainFade } from './audioFade';

let ctx: AudioContext | null = null;
let active: AudioBufferSourceNode[] = [];
/** Bumped on every start/stop so an in-flight async start can detect it was superseded. */
let generation = 0;

function stopNodes() {
  for (const node of active) {
    try {
      node.stop();
      node.disconnect();
    } catch {
      /* already stopped */
    }
  }
  active = [];
}

/** Stop all scheduled audio immediately. */
export function stop() {
  generation++;
  stopNodes();
}

/**
 * Begin playing all audio clips from timeline frame `fromFrame`.
 * Async because we decode any not-yet-decoded sources first.
 */
export async function start(project: Project, fromFrame: number, fps: number): Promise<void> {
  const myGen = ++generation;
  stopNodes();

  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* resume may be blocked without a gesture; play() is gesture-driven */
    }
  }
  if (myGen !== generation) return; // stopped while resuming

  // Collect audio clips across all (unmuted) audio tracks.
  const clips = [];
  for (const track of getTracksInOrder(project)) {
    if (track.kind !== 'audio' || track.muted) continue;
    for (const clip of getTrackClips(project, track.id)) {
      if (isAudioClip(clip)) clips.push(clip);
    }
  }
  if (clips.length === 0) return;

  const buffers = await Promise.all(clips.map((c) => getAudioBuffer(c.mediaId, ctx!)));
  if (myGen !== generation) return; // stopped/superseded while decoding

  const t0 = ctx.currentTime + 0.04; // tiny lead so scheduling is reliable
  const playSec = fromFrame / fps;

  clips.forEach((clip, i) => {
    const buffer = buffers[i];
    if (!buffer) return;
    const clipStartSec = clip.startFrame / fps;
    const clipEndSec = (clip.startFrame + clip.durationInFrames) / fps;
    if (clipEndSec <= playSec) return; // already finished by the playhead

    const speed = clip.speed;
    const elapsedSec = Math.max(0, playSec - clipStartSec); // real timeline seconds
    const when = t0 + Math.max(0, clipStartSec - playSec);
    // Source position advances at `speed` per real second.
    const offset = clip.sourceInFrame / fps + elapsedSec * speed;
    const remainInClip = clipEndSec - Math.max(clipStartSec, playSec); // real seconds left
    const remainInSource = Math.max(0, buffer.duration - offset);
    // At playbackRate `speed`, `remainInClip` real seconds needs speed× source.
    const duration = Math.min(remainInClip * speed, remainInSource);
    if (duration <= 0) return;

    const node = ctx!.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = speed;
    const gain = ctx!.createGain();
    scheduleGainFade(
      gain.gain,
      when,
      clip.gain,
      clip.fadeInFrames / project.fps,
      clip.fadeOutFrames / project.fps,
      clip.durationInFrames / project.fps,
      elapsedSec,
    );
    node.connect(gain).connect(ctx!.destination);
    node.start(when, offset, duration);
    active.push(node);
  });
}
