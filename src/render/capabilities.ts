/**
 * render/capabilities — feature-detect the export path up front so we can gate
 * the UI instead of failing mid-export. (WebCodecs audio only landed in
 * Safari 26, so this genuinely varies by browser.)
 */
export interface ExportSupport {
  supported: boolean;
  videoEncoder: boolean;
  audioEncoder: boolean;
  reason: string;
}

export function checkExportSupport(): ExportSupport {
  const hasVideo = typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder !== 'undefined';
  const hasAudio = typeof (globalThis as { AudioEncoder?: unknown }).AudioEncoder !== 'undefined';
  let reason = 'Ready to export (H.264 + AAC via WebCodecs).';
  if (!hasVideo) reason = 'This browser lacks WebCodecs VideoEncoder — use Chrome/Edge, or Safari 26+.';
  else if (!hasAudio) reason = 'Video export works, but audio encoding needs Safari 26+ / Chromium.';
  return { supported: hasVideo, videoEncoder: hasVideo, audioEncoder: hasAudio, reason };
}
