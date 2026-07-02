/**
 * captions/transcribe — on-device speech-to-text (Whisper via transformers.js).
 *
 * The real model is lazy-loaded (40 MB+) only when transcription is requested,
 * so it never bloats the main bundle. The function is injectable: tests (and
 * any future provider) can override it, so the auto-caption FLOW is testable
 * without downloading or running the model.
 */
export interface TranscriptWord {
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface TranscriptSegment {
  text: string;
  start: number; // seconds
  end: number; // seconds
  /** Per-word timings when the model provides them (karaoke sync). */
  words?: TranscriptWord[];
}

export type TranscribeFn = (
  pcm: Float32Array,
  sampleRate: number,
  onStatus: (status: string) => void,
) => Promise<TranscriptSegment[]>;

/** Multilingual tiny model — small download, reasonable for many languages. */
const MODEL = 'Xenova/whisper-tiny';

let override: TranscribeFn | null = null;

/** Replace the transcriber (used by tests / alternative providers). */
export function setTranscriberOverride(fn: TranscribeFn | null): void {
  override = fn;
}

// The ASR pipeline holds the full fp32 model in memory — build it ONCE and
// reuse it across transcriptions (rebuilding per call leaked a model each run).
let asrPromise: Promise<unknown> | null = null;
// Status sink for the CURRENT run (the download progress callback is bound
// once, at pipeline build time).
let statusSink: (status: string) => void = () => {};

function getAsr(): Promise<unknown> {
  if (asrPromise) return asrPromise;
  asrPromise = (async () => {
    const tf = await import('@huggingface/transformers');
    // Force single-threaded WASM so it runs without cross-origin isolation
    // (SharedArrayBuffer/COOP-COEP). Slower, but works on any host.
    try {
      (tf.env.backends.onnx.wasm as { numThreads?: number }).numThreads = 1;
    } catch {
      /* env shape may change across versions — non-fatal */
    }
    return tf.pipeline('automatic-speech-recognition', MODEL, {
      // fp32 avoids broken 4-bit (MatMulNBits) quantized weights in some ORT builds.
      dtype: 'fp32',
      progress_callback: (p: { status?: string; progress?: number }) => {
        if (p.status === 'progress' && typeof p.progress === 'number') {
          statusSink(`Downloading model ${Math.round(p.progress)}%`);
        }
      },
    });
  })();
  // A failed build must not poison every future attempt.
  asrPromise.catch(() => {
    asrPromise = null;
  });
  return asrPromise;
}

export async function transcribe(
  pcm: Float32Array,
  sampleRate: number,
  onStatus: (status: string) => void,
): Promise<TranscriptSegment[]> {
  if (override) return override(pcm, sampleRate, onStatus);
  if (import.meta.env.DEV) {
    const win = window as unknown as { __transcribeOverride?: TranscribeFn };
    if (win.__transcribeOverride) return win.__transcribeOverride(pcm, sampleRate, onStatus);
  }

  onStatus('Loading speech model…');
  statusSink = onStatus;
  const asr = await getAsr();

  onStatus('Transcribing…');
  // Word-level timestamps: each chunk is ONE word — we group them into caption-
  // sized segments ourselves, keeping the per-word timing for karaoke sync.
  const result = (await (asr as unknown as CallableFunction)(pcm, {
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
  })) as { chunks?: Array<{ text?: string; timestamp?: [number, number] }> };

  const words: TranscriptWord[] = (result.chunks ?? [])
    .map((c) => ({
      text: (c.text ?? '').trim(),
      start: c.timestamp?.[0] ?? 0,
      end: c.timestamp?.[1] ?? (c.timestamp?.[0] ?? 0) + 0.4,
    }))
    .filter((w) => w.text.length > 0);
  return groupWords(words);
}

/** Caption-sized grouping limits (chars / pause gap / max length). */
const MAX_CHARS = 42;
const MAX_GAP_SEC = 0.6;
const MAX_DUR_SEC = 3.5;

/**
 * PURE: group word timings into caption segments. A new segment starts on a
 * long pause, when the line grows past ~42 chars, or past ~3.5s — roughly the
 * pacing of platform auto-captions. Unit-tested.
 */
export function groupWords(words: TranscriptWord[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let cur: TranscriptWord[] = [];

  const flush = () => {
    if (cur.length === 0) return;
    segments.push({
      text: cur.map((w) => w.text).join(' '),
      start: cur[0].start,
      end: cur[cur.length - 1].end,
      words: cur,
    });
    cur = [];
  };

  for (const w of words) {
    if (cur.length > 0) {
      const chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
      const gap = w.start - cur[cur.length - 1].end;
      const dur = w.end - cur[0].start;
      if (chars > MAX_CHARS || gap > MAX_GAP_SEC || dur > MAX_DUR_SEC) flush();
    }
    cur.push(w);
  }
  flush();
  return segments;
}
