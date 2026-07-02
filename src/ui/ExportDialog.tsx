/**
 * ui/ExportDialog — choose output resolution, quality, and format before export.
 */
import { useEffect, useState } from 'react';
import { useEditor } from '../store/editorStore';
import type { ExportFormat, ExportQuality } from '../render/export';

const RESOLUTIONS = [
  { label: 'Full', scale: 1 },
  { label: '75%', scale: 0.75 },
  { label: '50%', scale: 0.5 },
];

export function ExportDialog() {
  const open = useEditor((s) => s.exportDialogOpen);
  const close = useEditor((s) => s.closeExportDialog);
  const exportVideo = useEditor((s) => s.exportVideo);
  const width = useEditor((s) => s.project.width);
  const height = useEditor((s) => s.project.height);
  const durationInFrames = useEditor((s) => s.project.durationInFrames);
  const fps = useEditor((s) => s.project.fps);

  const [scale, setScale] = useState(1);
  const [quality, setQuality] = useState<ExportQuality>('high');
  const [format, setFormat] = useState<ExportFormat>('auto');

  // Escape closes, like the Help dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);
  const empty = durationInFrames <= 0;
  const outSeconds = durationInFrames / fps;

  return (
    <div className="modal" onClick={close}>
      <div
        className="modal__card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
      >
        <h3 id="export-dialog-title">Export video</h3>
        <label className="field">
          <span>Resolution</span>
          <select autoFocus value={scale} onChange={(e) => setScale(Number(e.target.value))}>
            {RESOLUTIONS.map((r) => (
              <option key={r.label} value={r.scale}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label
          className="field"
          data-tip="High = best-looking, biggest file. Low = fastest, smallest."
        >
          <span>Quality</span>
          <select value={quality} onChange={(e) => setQuality(e.target.value as ExportQuality)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label
          className="field"
          data-tip="Auto picks MP4 when the browser can encode it (plays everywhere), otherwise WebM."
        >
          <span>Format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            <option value="auto">Auto (MP4 / WebM)</option>
            <option value="mp4">MP4 (H.264)</option>
            <option value="webm">WebM (VP9)</option>
          </select>
        </label>
        <p className="modal__hint">
          {empty
            ? 'Your timeline is empty — add media to a track first, then export.'
            : `Output: ${outW}×${outH} · ${outSeconds.toFixed(1)}s`}
        </p>
        <div className="modal__actions">
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button
            className="btn btn--primary export-dialog__go"
            disabled={empty}
            onClick={() => void exportVideo({ resolutionScale: scale, quality, format })}
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
