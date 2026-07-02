/**
 * media/thumbnails — filmstrip frames for timeline clips.
 *
 * Images return their own URL (tiled by the renderer). Videos are sampled into
 * a fixed number of frames (decoded once via a dedicated <video> element, so it
 * never fights the preview's seeking) and cached per media id.
 */
import type { MediaAsset } from '../core/model';

const FRAME_COUNT = 12;
const MAX_ATTEMPTS = 2;
const cache = new Map<string, string[]>();
const inflight = new Map<string, Promise<string[]>>();
const attempts = new Map<string, number>();

/**
 * Drop the cached filmstrip for a media id — called when its runtime entry is
 * disposed (the cached frames reference a revoked object URL) so a later
 * re-import extracts fresh frames instead of rendering blanks.
 */
export function invalidateFilmstrip(mediaId: string): void {
  cache.delete(mediaId);
  attempts.delete(mediaId);
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    try {
      video.currentTime = t;
    } catch {
      resolve();
    }
    setTimeout(() => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    }, 800);
  });
}

async function extractVideoFrames(src: string, count: number): Promise<string[]> {
  const video = document.createElement('video');
  video.src = src;
  video.muted = true;
  video.preload = 'auto';
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('thumbnail: failed to load video'));
  });
  const duration = video.duration || 0;
  const h = 48;
  const ratio = video.videoWidth / Math.max(1, video.videoHeight);
  const w = Math.max(32, Math.round(h * (ratio || 16 / 9)));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const frames: string[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const t = duration > 0 ? (i / count) * duration : 0;
      await seekTo(video, t);
      if (ctx) {
        ctx.drawImage(video, 0, 0, w, h);
        frames.push(canvas.toDataURL('image/jpeg', 0.6));
      }
    }
  } finally {
    // Release the decoder/buffered data — we never need this element again.
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  return frames;
}

/** Resolve a clip's filmstrip frames (cached). Audio → empty. */
export function getFilmstrip(media: MediaAsset): Promise<string[]> {
  const cached = cache.get(media.id);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(media.id);
  if (existing) return existing;

  const job = (async () => {
    let frames: string[] = [];
    try {
      if (media.kind === 'image') frames = [media.src];
      else if (media.kind === 'video') frames = await extractVideoFrames(media.src, FRAME_COUNT);
    } catch {
      frames = [];
    } finally {
      inflight.delete(media.id);
    }
    if (frames.length > 0) {
      cache.set(media.id, frames);
    } else {
      // Don't cache a transient failure forever — retry a couple of times,
      // then give up (e.g. genuinely unsupported codec) to avoid re-decoding.
      const n = (attempts.get(media.id) ?? 0) + 1;
      attempts.set(media.id, n);
      if (n >= MAX_ATTEMPTS) cache.set(media.id, []);
    }
    return frames;
  })();
  inflight.set(media.id, job);
  return job;
}
