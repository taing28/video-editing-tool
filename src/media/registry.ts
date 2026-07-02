/**
 * media/registry — runtime media, kept OUT of the serializable document.
 *
 * The Project stores only metadata + a `src`. Decoded pixels/elements live here
 * in a module-level map keyed by MediaId. The render seam asks this registry to
 * `resolve` a media id into a drawable. Nothing here is persisted.
 */
import type { MediaAsset, MediaKind } from '../core/model';
import { newMediaId } from '../core/ids';
import type { MediaId } from '../core/ids';
import { secondsToFrames } from '../core/time';
import type { ResolvedMedia } from '../render/scene';
import { invalidateFilmstrip } from './thumbnails';

interface RegistryEntry extends ResolvedMedia {
  kind: MediaKind;
  /** Element kept alive for video/audio decode/seek/playback in later phases. */
  element?: HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
  objectUrl?: string;
  /** Original file, kept so export can decode audio PCM on demand. */
  file?: File;
  /** Cached decoded audio (per export sample rate). */
  audioBuffer?: AudioBuffer;
  /** In-flight decode, so N concurrent waveforms share ONE decode. */
  audioBufferPromise?: Promise<AudioBuffer | undefined>;
}

const entries = new Map<string, RegistryEntry>();

/** Default still-image display length when first placed (5 seconds). */
const DEFAULT_IMAGE_SECONDS = 5;

export function resolveMedia(id: MediaId): ResolvedMedia | undefined {
  return entries.get(id);
}

function kindFromType(type: string, name: string): MediaKind | undefined {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  // Fall back to extension sniffing for files with empty MIME types.
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'webm', 'mkv', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext)) return 'audio';
  return undefined;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

function loadMediaElement<T extends HTMLVideoElement | HTMLAudioElement>(el: T, url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    el.preload = 'metadata';
    el.onloadedmetadata = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to load media metadata'));
    el.src = url;
  });
}

/**
 * Chrome quirk: blobs produced by MediaRecorder (e.g. a voiceover recording)
 * report `duration: Infinity` until the element is seeked far ahead. Force the
 * real duration out; falls back to 0 (caller applies a default).
 */
function ensureFiniteDuration(el: HTMLVideoElement | HTMLAudioElement): Promise<number> {
  if (Number.isFinite(el.duration) && el.duration > 0) return Promise.resolve(el.duration);
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener('durationchange', done);
      el.currentTime = 0;
      resolve(Number.isFinite(el.duration) ? el.duration : 0);
    };
    el.addEventListener('durationchange', done);
    try {
      el.currentTime = Number.MAX_SAFE_INTEGER;
    } catch {
      done();
    }
    setTimeout(done, 1500);
  });
}

/**
 * Import one File: create an object URL, decode just enough to learn its size /
 * duration, register the runtime drawable, and return the serializable asset.
 * `fps` is needed to convert the source's natural seconds into frames.
 */
export async function importFile(file: File, fps: number): Promise<MediaAsset> {
  const kind = kindFromType(file.type, file.name);
  if (!kind) throw new Error(`Unsupported file type: ${file.name}`);

  const id = newMediaId();
  const url = URL.createObjectURL(file);
  const asset: MediaAsset = {
    id,
    kind,
    name: file.name,
    src: url,
    durationInFrames: secondsToFrames(DEFAULT_IMAGE_SECONDS, fps),
  };

  if (kind === 'image') {
    const img = await loadImage(url);
    asset.width = img.naturalWidth;
    asset.height = img.naturalHeight;
    entries.set(id, {
      kind,
      objectUrl: url,
      file,
      element: img,
      drawable: img,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    });
  } else if (kind === 'video') {
    const video = await loadMediaElement(document.createElement('video'), url);
    asset.width = video.videoWidth;
    asset.height = video.videoHeight;
    asset.durationInFrames = secondsToFrames(
      (await ensureFiniteDuration(video)) || DEFAULT_IMAGE_SECONDS,
      fps,
    );
    entries.set(id, {
      kind,
      objectUrl: url,
      file,
      element: video,
      drawable: video,
      naturalWidth: video.videoWidth,
      naturalHeight: video.videoHeight,
    });
  } else {
    const audio = await loadMediaElement(document.createElement('audio'), url);
    asset.durationInFrames = secondsToFrames(
      (await ensureFiniteDuration(audio)) || DEFAULT_IMAGE_SECONDS,
      fps,
    );
    entries.set(id, { kind, objectUrl: url, file, element: audio });
  }

  return asset;
}

/** The drawable (image/video element) for a media id, for the export painter. */
export function getDrawable(id: MediaId): CanvasImageSource | undefined {
  return entries.get(id)?.drawable;
}

/** The original imported File for a media id (for bundling into a project file). */
export function getMediaFile(id: MediaId): File | undefined {
  return entries.get(id)?.file;
}

/** The underlying <video> element for a video asset (for seeking/playback). */
export function getVideoElement(id: MediaId): HTMLVideoElement | undefined {
  const entry = entries.get(id);
  return entry?.kind === 'video' ? (entry.element as HTMLVideoElement) : undefined;
}

/**
 * Decode a media asset's audio into an AudioBuffer at the given context's
 * sample rate (cached). Used by the export audio mixdown.
 */
export async function getAudioBuffer(
  id: MediaId,
  audioContext: BaseAudioContext,
): Promise<AudioBuffer | undefined> {
  const entry = entries.get(id);
  if (!entry?.file) return undefined;
  if (entry.audioBuffer) return entry.audioBuffer;
  if (entry.audioBufferPromise) return entry.audioBufferPromise;
  const job = (async () => {
    try {
      const arrayBuffer = await entry.file!.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(arrayBuffer);
      entry.audioBuffer = decoded;
      return decoded;
    } finally {
      entry.audioBufferPromise = undefined;
    }
  })();
  entry.audioBufferPromise = job;
  return job;
}

/**
 * Rebuild the runtime entry for an ALREADY-KNOWN asset from its persisted file
 * (used on reload). Returns a fresh object URL to patch into the asset's `src`.
 */
export async function reimportFile(asset: MediaAsset, file: File): Promise<string> {
  // Replacing an existing entry (e.g. re-opening a project bundle in-session)
  // must release the old object URL or every open leaks the previous blob.
  const existing = entries.get(asset.id);
  if (existing?.objectUrl) URL.revokeObjectURL(existing.objectUrl);
  const url = URL.createObjectURL(file);
  if (asset.kind === 'image') {
    const img = await loadImage(url);
    entries.set(asset.id, {
      kind: 'image',
      objectUrl: url,
      file,
      element: img,
      drawable: img,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    });
  } else if (asset.kind === 'video') {
    const video = await loadMediaElement(document.createElement('video'), url);
    entries.set(asset.id, {
      kind: 'video',
      objectUrl: url,
      file,
      element: video,
      drawable: video,
      naturalWidth: video.videoWidth,
      naturalHeight: video.videoHeight,
    });
  } else {
    const audio = await loadMediaElement(document.createElement('audio'), url);
    entries.set(asset.id, { kind: 'audio', objectUrl: url, file, element: audio });
  }
  return url;
}

/** Release the object URL + drop the runtime entry for a media id. */
export function disposeMedia(id: MediaId): void {
  const entry = entries.get(id);
  if (entry?.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  entries.delete(id);
  // Filmstrip thumbnails hold the (now revoked) object URL — drop them too.
  invalidateFilmstrip(id);
}

/**
 * Dispose every runtime media NOT in `keep` (object URLs + File blobs).
 * Called when the whole document is replaced (open file / new project) so the
 * outgoing project's media doesn't leak.
 */
export function disposeUnusedMedia(keep: Set<string>): void {
  for (const id of [...entries.keys()]) {
    if (!keep.has(id)) disposeMedia(id as MediaId);
  }
}
