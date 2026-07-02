/**
 * render/export — turn the timeline into a real video file.
 *
 * The model (per the architecture): a DETERMINISTIC fake clock walks every
 * frame, paints it through the SAME `buildScene` the preview uses, and feeds it
 * to mediabunny's WebCodecs encoder. Audio is mixed SEPARATELY with an
 * OfflineAudioContext (sample-accurate, 48 kHz) and muxed in. No ffmpeg.
 *
 * Codec/container are chosen by capability: H.264+AAC in MP4 when available,
 * otherwise VP9/VP8+Opus in WebM — so it works across browsers.
 */
import {
  Output,
  BufferTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  CanvasSource,
  AudioBufferSource,
  getFirstEncodableVideoCodec,
  getFirstEncodableAudioCodec,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
  QUALITY_LOW,
  type Quality,
  type VideoCodec,
  type AudioCodec,
} from 'mediabunny';
import type { Project, VideoClip } from '../core/model';
import {
  computeDuration,
  getActiveAudioClips,
  getActiveVideoClips,
  sourceFrameAt,
  voiceIntervals,
} from '../core/selectors';
import { buildScene } from './scene';
import { paintScene } from './paint';
import { resolveMedia, getAudioBuffer, getVideoElement } from '../media/registry';
import { scheduleGainFade } from '../playback/audioFade';
import { scheduleDuck, DUCK_LEVEL } from '../playback/duck';

export interface ExportResult {
  blob: Blob;
  filename: string;
  codec: VideoCodec;
  container: 'mp4' | 'webm';
}

export type ExportQuality = 'high' | 'medium' | 'low';
export type ExportFormat = 'auto' | 'mp4' | 'webm';

export interface ExportOptions {
  onProgress?: (fraction: number) => void;
  /** Cancel mid-export. */
  signal?: AbortSignal;
  /** Output size as a fraction of the canvas (1 = full, 0.5 = half). */
  resolutionScale?: number;
  quality?: ExportQuality;
  /** Force a container/codec family, or 'auto' to pick by capability. */
  format?: ExportFormat;
}

const SAMPLE_RATE = 48000;

const QUALITY: Record<ExportQuality, Quality> = {
  high: QUALITY_HIGH,
  medium: QUALITY_MEDIUM,
  low: QUALITY_LOW,
};

/** Even dimensions — H.264 requires it; harmless for the others. */
const even = (n: number) => (n % 2 === 0 ? n : n - 1);

/** Seek a <video> to a time and resolve once the frame is ready (bounded). */
function seekVideo(el: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(el.currentTime - timeSec) < 1e-3 && el.readyState >= 2) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('seeked', finish);
      resolve();
    };
    el.addEventListener('seeked', finish);
    try {
      el.currentTime = timeSec;
    } catch {
      finish();
    }
    setTimeout(finish, 500); // safety net for browsers that won't fire 'seeked'
  });
}

/**
 * Seek every video clip visible at `frame` to its correct source position.
 *
 * When SEVERAL clips show the same media at once (e.g. a cross-dissolve between
 * two cuts of one file), the single shared <video> element can't hold two times
 * — the later seek would win and both layers would draw the same pixels. For
 * those, seek sequentially and SNAPSHOT each clip's frame into a per-clip
 * scratch canvas, returned as drawable overrides keyed by clip id.
 */
async function seekVideosForFrame(
  project: Project,
  frame: number,
  scratch: Map<string, HTMLCanvasElement>,
): Promise<Map<string, CanvasImageSource>> {
  const overrides = new Map<string, CanvasImageSource>();
  const groups = new Map<string, VideoClip[]>();
  for (const { clip } of getActiveVideoClips(project, frame)) {
    if (clip.kind !== 'video') continue;
    const arr = groups.get(clip.mediaId) ?? [];
    arr.push(clip);
    groups.set(clip.mediaId, arr);
  }

  const jobs: Promise<void>[] = [];
  for (const [mediaId, clips] of groups) {
    const el = getVideoElement(mediaId as Parameters<typeof getVideoElement>[0]);
    if (!el) continue;
    if (clips.length === 1) {
      jobs.push(seekVideo(el, sourceFrameAt(clips[0], frame) / project.fps));
    } else {
      jobs.push(
        (async () => {
          for (const clip of clips) {
            await seekVideo(el, sourceFrameAt(clip, frame) / project.fps);
            let canvas = scratch.get(clip.id);
            if (!canvas) {
              canvas = document.createElement('canvas');
              scratch.set(clip.id, canvas);
            }
            canvas.width = el.videoWidth || 2;
            canvas.height = el.videoHeight || 2;
            canvas.getContext('2d')?.drawImage(el, 0, 0);
            overrides.set(clip.id, canvas);
          }
        })(),
      );
    }
  }
  if (jobs.length) await Promise.all(jobs);
  return overrides;
}

/** Collect every audio clip across all tracks (ignores per-track mute here). */
function allAudioClips(project: Project) {
  const max = computeDuration(project);
  const seen = new Set<string>();
  const clips: ReturnType<typeof getActiveAudioClips> = [];
  for (let f = 0; f < max; f++) {
    for (const entry of getActiveAudioClips(project, f)) {
      if (!seen.has(entry.clip.id)) {
        seen.add(entry.clip.id);
        clips.push(entry);
      }
    }
  }
  return clips;
}

/** Mix all audio clips into one stereo AudioBuffer at SAMPLE_RATE, or null. */
async function mixAudio(project: Project, totalSeconds: number): Promise<AudioBuffer | null> {
  const clips = allAudioClips(project);
  if (clips.length === 0) return null;

  const length = Math.max(1, Math.ceil(totalSeconds * SAMPLE_RATE));
  const ctx = new OfflineAudioContext(2, length, SAMPLE_RATE);
  const voice = voiceIntervals(project).map(
    ([s, e]) => [s / project.fps, e / project.fps] as [number, number],
  );

  let scheduled = 0;
  for (const { clip } of clips) {
    const buffer = await getAudioBuffer(clip.mediaId, ctx);
    if (!buffer) continue;
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = clip.speed;
    const gain = ctx.createGain();
    const when = clip.startFrame / project.fps; // timeline position (s)
    const offset = clip.sourceInFrame / project.fps; // trim into source (s)
    const timelineDur = clip.durationInFrames / project.fps; // real seconds on the timeline
    scheduleGainFade(
      gain.gain,
      when,
      clip.gain,
      clip.fadeInFrames / project.fps,
      clip.fadeOutFrames / project.fps,
      timelineDur,
      0,
    );
    if (clip.duck) {
      const duckGain = ctx.createGain();
      scheduleDuck(duckGain.gain, when, when, when + timelineDur, voice, DUCK_LEVEL);
      node.connect(gain).connect(duckGain).connect(ctx.destination);
    } else {
      node.connect(gain).connect(ctx.destination);
    }
    // At playbackRate `speed`, filling `timelineDur` needs speed× source seconds.
    const available = Math.max(0, buffer.duration - offset);
    node.start(when, offset, Math.min(timelineDur * clip.speed, available));
    scheduled++;
  }
  if (scheduled === 0) return null;
  return ctx.startRendering();
}

export async function exportProject(
  project: Project,
  opts: ExportOptions = {},
): Promise<ExportResult> {
  const durationInFrames = computeDuration(project);
  if (durationInFrames <= 0) throw new Error('Nothing to export — the timeline is empty.');

  const fps = project.fps;
  const totalSeconds = durationInFrames / fps;
  const bitrate = QUALITY[opts.quality ?? 'high'];

  // Output size = canvas size scaled by resolutionScale (even, for H.264).
  const scaleReq = Math.min(1, Math.max(0.1, opts.resolutionScale ?? 1));
  const width = even(Math.round(project.width * scaleReq));
  const height = even(Math.round(project.height * scaleReq));
  // The scene is built in project pixels; we scale the canvas context to fit.
  const sx = width / project.width;
  const sy = height / project.height;

  // --- pick codecs / container by capability + requested format ---
  const videoCandidates: VideoCodec[] =
    opts.format === 'mp4'
      ? ['avc', 'hevc']
      : opts.format === 'webm'
        ? ['vp9', 'vp8', 'av1']
        : ['avc', 'vp9', 'vp8', 'av1'];
  const videoCodec = await getFirstEncodableVideoCodec(videoCandidates, { width, height });
  if (!videoCodec) {
    throw new Error('No supported video encoder for that format. Try a different format or browser.');
  }
  const isMp4 = videoCodec === 'avc' || videoCodec === 'hevc';
  const container: 'mp4' | 'webm' = isMp4 ? 'mp4' : 'webm';

  const hasAudio = allAudioClips(project).length > 0;
  const audioCodec: AudioCodec | null = hasAudio
    ? await getFirstEncodableAudioCodec(isMp4 ? ['aac', 'opus'] : ['opus', 'vorbis'], {
        numberOfChannels: 2,
        sampleRate: SAMPLE_RATE,
      })
    : null;

  // --- set up the output ---
  const target = new BufferTarget();
  const output = new Output({
    format: isMp4 ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target,
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D canvas context for export.');

  const videoSource = new CanvasSource(canvas, { codec: videoCodec, bitrate });
  output.addVideoTrack(videoSource, { frameRate: fps });

  let audioSource: AudioBufferSource | null = null;
  if (audioCodec) {
    audioSource = new AudioBufferSource({ codec: audioCodec, bitrate });
    output.addAudioTrack(audioSource);
  }

  await output.start();

  const checkAborted = async () => {
    if (opts.signal?.aborted) {
      await output.cancel();
      throw new DOMException('Export cancelled', 'AbortError');
    }
  };

  try {
    // --- audio first (independent of the video frame loop) ---
    if (audioSource) {
      const mixed = await mixAudio(project, totalSeconds);
      await checkAborted();
      if (mixed) await audioSource.add(mixed);
    }

    // --- deterministic per-frame video render ---
    // Fonts must be ready or text falls back to the wrong face in the output.
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready;
    }
    // Scratch canvases for clips that share a <video> element with another
    // visible clip (see seekVideosForFrame); reused across frames.
    const videoScratch = new Map<string, HTMLCanvasElement>();
    for (let frame = 0; frame < durationInFrames; frame++) {
      await checkAborted();
      const overrides = await seekVideosForFrame(project, frame, videoScratch);
      const scene = buildScene(project, frame, resolveMedia);
      if (overrides.size > 0) {
        for (const layer of scene.layers) {
          if (layer.kind === 'image') {
            const snap = overrides.get(layer.clipId);
            if (snap) layer.drawable = snap;
          }
        }
      }
      // Scene is in project pixels; scale the context to the export resolution.
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      paintScene(ctx, scene);
      await videoSource.add(frame / fps, 1 / fps);
      if (opts.onProgress && (frame % 3 === 0 || frame === durationInFrames - 1)) {
        opts.onProgress((frame + 1) / durationInFrames);
      }
    }

    await output.finalize();
  } catch (err) {
    // Abort already cancelled the output in checkAborted; every OTHER failure
    // must cancel too, or the WebCodecs encoders and muxer buffers leak.
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      await output.cancel().catch(() => {});
    }
    throw err;
  }

  const buffer = target.buffer;
  if (!buffer) throw new Error('Export produced no data.');
  const blob = new Blob([buffer], { type: isMp4 ? 'video/mp4' : 'video/webm' });
  const safeName = (project.name || 'export').replace(/[^\w.-]+/g, '_');
  return { blob, filename: `${safeName}.${container}`, codec: videoCodec, container };
}
