/**
 * captions/transcribe — on-device speech-to-text (Whisper via transformers.js).
 *
 * The real model is lazy-loaded (40 MB+) only when transcription is requested,
 * so it never bloats the main bundle. The function is injectable: tests (and
 * any future provider) can override it, so the auto-caption FLOW is testable
 * without downloading or running the model.
 */
export interface TranscriptSegment {
  text: string;
  start: number; // seconds
  end: number; // seconds
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
  const tf = await import('@huggingface/transformers');
  // Force single-threaded WASM so it runs without cross-origin isolation
  // (SharedArrayBuffer/COOP-COEP). Slower, but works on any host.
  try {
    (tf.env.backends.onnx.wasm as { numThreads?: number }).numThreads = 1;
  } catch {
    /* env shape may change across versions — non-fatal */
  }
  const asr = await tf.pipeline('automatic-speech-recognition', MODEL, {
    // fp32 avoids broken 4-bit (MatMulNBits) quantized weights in some ORT builds.
    dtype: 'fp32',
    progress_callback: (p: { status?: string; progress?: number }) => {
      if (p.status === 'progress' && typeof p.progress === 'number') {
        onStatus(`Downloading model ${Math.round(p.progress)}%`);
      }
    },
  });

  onStatus('Transcribing…');
  const result = (await (asr as unknown as CallableFunction)(pcm, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  })) as { chunks?: Array<{ text?: string; timestamp?: [number, number] }> };

  const chunks = result.chunks ?? [];
  return chunks
    .map((c) => ({
      text: (c.text ?? '').trim(),
      start: c.timestamp?.[0] ?? 0,
      end: c.timestamp?.[1] ?? (c.timestamp?.[0] ?? 0) + 2,
    }))
    .filter((s) => s.text.length > 0);
}
