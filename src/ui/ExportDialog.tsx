/**
 * ui/ExportDialog — choose output resolution, quality, and format before export.
 */
import { useState } from 'react';
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

  const [scale, setScale] = useState(1);
  const [quality, setQuality] = useState<ExportQuality>('high');
  const [format, setFormat] = useState<ExportFormat>('auto');

  if (!open) return null;
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);

  return (
    <div className="modal" onClick={close}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <h3>Export video</h3>
        <label className="field">
          <span>Resolution</span>
          <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
            {RESOLUTIONS.map((r) => (
              <option key={r.label} value={r.scale}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Quality</span>
          <select value={quality} onChange={(e) => setQuality(e.target.value as ExportQuality)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="field">
          <span>Format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            <option value="auto">Auto (MP4 / WebM)</option>
            <option value="mp4">MP4 (H.264)</option>
            <option value="webm">WebM (VP9)</option>
          </select>
        </label>
        <p className="modal__hint">
          Output: {outW}×{outH}
        </p>
        <div className="modal__actions">
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button
            className="btn btn--primary export-dialog__go"
            onClick={() => void exportVideo({ resolutionScale: scale, quality, format })}
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
