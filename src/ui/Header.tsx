/**
 * ui/Header — slim top bar: project identity + file actions only.
 * Editing controls live on the EditorBar; content/settings live in the LeftDock.
 */
import { useRef } from 'react';
import { useEditor } from '../store/editorStore';
import { checkExportSupport } from '../render/capabilities';
import { HelpButton } from './HelpDialog';

export function Header() {
  const projectName = useEditor((s) => s.project.name);
  const renameProject = useEditor((s) => s.renameProject);
  const openExportDialog = useEditor((s) => s.openExportDialog);
  const isExporting = useEditor((s) => s.isExporting);
  const saveProjectFile = useEditor((s) => s.saveProjectFile);
  const openProjectFile = useEditor((s) => s.openProjectFile);
  const openInputRef = useRef<HTMLInputElement>(null);
  const support = checkExportSupport();

  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__logo">🎬</span>
        <input
          className="toolbar__name"
          value={projectName}
          spellCheck={false}
          onChange={(e) => renameProject(e.target.value)}
          aria-label="Project name"
        />
      </div>

      <div className="header__actions">
        <button
          className="btn"
          onClick={() => {
            saveProjectFile().catch((err) => {
              console.warn('Save project failed:', err);
              window.alert('Could not save the project file.');
            });
          }}
          data-tip="Save the whole project (timeline + media) to a file you can back up or reopen. Not a video — use Export for that."
        >
          💾 Save
        </button>
        <button
          className="btn"
          onClick={() => openInputRef.current?.click()}
          data-tip="Open a previously saved project file (replaces the current project)."
        >
          📂 Open
        </button>
        <input
          ref={openInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            openProjectFile(f).catch((err) => {
              console.warn('Open project failed:', err);
              window.alert('Could not open this project file. It may be invalid or corrupted.');
            });
          }}
        />
        <button
          className="btn btn--primary"
          onClick={openExportDialog}
          disabled={isExporting || !support.supported}
          data-tip={
            support.supported
              ? 'Render the final video file (MP4/WebM) with your chosen resolution and quality.'
              : support.reason
          }
        >
          ⬇ Export
        </button>
        <HelpButton />
      </div>
    </header>
  );
}
