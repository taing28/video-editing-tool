/**
 * ui/TranscribeOverlay — busy overlay shown while transcribing audio to captions.
 */
import { useEditor } from '../store/editorStore';

export function TranscribeOverlay() {
  const isTranscribing = useEditor((s) => s.isTranscribing);
  const status = useEditor((s) => s.transcribeStatus);
  if (!isTranscribing) return null;

  return (
    <div className="export-overlay">
      <div className="export-overlay__card">
        <h3>Generating captions</h3>
        <div className="export-overlay__bar export-overlay__bar--indeterminate">
          <div className="export-overlay__fill" />
        </div>
        <p>{status ?? 'Working…'}</p>
        <p className="export-overlay__note">First run downloads the speech model (~40 MB).</p>
      </div>
    </div>
  );
}
