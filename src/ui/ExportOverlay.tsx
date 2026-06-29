/**
 * ui/ExportOverlay — full-screen progress while rendering the export.
 */
import { useEditor } from '../store/editorStore';

export function ExportOverlay() {
  const isExporting = useEditor((s) => s.isExporting);
  const progress = useEditor((s) => s.exportProgress);
  const status = useEditor((s) => s.exportStatus);
  const cancelExport = useEditor((s) => s.cancelExport);
  if (!isExporting) return null;

  return (
    <div className="export-overlay">
      <div className="export-overlay__card">
        <h3>Exporting video</h3>
        <div className="export-overlay__bar">
          <div className="export-overlay__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p>{status ?? 'Working…'}</p>
        <button className="btn export-overlay__cancel" onClick={cancelExport}>
          Cancel
        </button>
      </div>
    </div>
  );
}
