/**
 * media/recorder — microphone voiceover capture.
 *
 * Wraps getUserMedia + MediaRecorder into a small handle the Record panel
 * drives: start → (live level readings for a meter) → stop() resolves to a
 * File that goes through the NORMAL import path (registry/importFile), so a
 * recording behaves exactly like any imported audio clip — including ducking.
 */

export interface RecorderHandle {
  /** Stop and get the recording as an importable File. */
  stop: () => Promise<File>;
  /** Discard the recording (releases the mic without importing). */
  cancel: () => void;
  /** Current input level 0..1 (RMS-ish) — poll from a rAF for a meter. */
  level: () => number;
  /** Recording start time (performance.now()), for an elapsed readout. */
  startedAt: number;
}

/** Pick a MIME type the current browser can actually record. */
function pickMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

let counter = 0;

/**
 * Ask for the microphone and start recording. Rejects if the user denies
 * permission (surface that as a friendly hint in the UI).
 */
export async function startRecording(): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });

  // Level meter: a small analyser on the live stream.
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.frequencyBinCount);

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(250); // gather in small chunks so stop() has everything

  const teardown = () => {
    stream.getTracks().forEach((t) => t.stop());
    source.disconnect();
    void audioCtx.close();
  };

  return {
    startedAt: performance.now(),
    level: () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / buf.length) * 3);
    },
    stop: () =>
      new Promise<File>((resolve, reject) => {
        recorder.onstop = () => {
          teardown();
          const type = recorder.mimeType || 'audio/webm';
          const ext = type.includes('mp4') ? 'm4a' : 'webm';
          counter += 1;
          resolve(new File(chunks, `Voiceover ${counter}.${ext}`, { type }));
        };
        recorder.onerror = () => {
          teardown();
          reject(new Error('Recording failed'));
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
      teardown();
    },
  };
}
