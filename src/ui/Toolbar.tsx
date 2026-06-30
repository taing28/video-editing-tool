/**
 * ui/Toolbar — transport + editing actions across the top.
 */
import { useRef } from 'react';
import { useEditor } from '../store/editorStore';
import { formatTimecode } from '../core/time';
import { checkExportSupport } from '../render/capabilities';
import { HelpButton } from './HelpDialog';

const CANVAS_PRESETS = [
  { label: '16:9 · 1920×1080', w: 1920, h: 1080 },
  { label: '9:16 · 1080×1920', w: 1080, h: 1920 },
  { label: '1:1 · 1080×1080', w: 1080, h: 1080 },
  { label: '4:3 · 1440×1080', w: 1440, h: 1080 },
];

export function Toolbar() {
  const projectName = useEditor((s) => s.project.name);
  const renameProject = useEditor((s) => s.renameProject);
  const isPlaying = useEditor((s) => s.isPlaying);
  const togglePlay = useEditor((s) => s.togglePlay);
  const playhead = useEditor((s) => s.playhead);
  const fps = useEditor((s) => s.project.fps);
  const pxPerFrame = useEditor((s) => s.pxPerFrame);
  const setZoom = useEditor((s) => s.setZoom);

  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);

  const split = useEditor((s) => s.splitSelectedAtPlayhead);
  const duplicate = useEditor((s) => s.duplicateSelected);
  const remove = useEditor((s) => s.removeSelected);
  const addText = useEditor((s) => s.addTextEffect);
  const addCaption = useEditor((s) => s.addCaption);
  const addShape = useEditor((s) => s.addShape);
  const addLowerThird = useEditor((s) => s.addLowerThird);
  const autoCaption = useEditor((s) => s.autoCaption);
  const isTranscribing = useEditor((s) => s.isTranscribing);
  const hasSelection = useEditor((s) => Boolean(s.selectedClipId || s.selectedEffectId));

  const addTrack = useEditor((s) => s.addTrack);
  const setCanvasSize = useEditor((s) => s.setCanvasSize);
  const width = useEditor((s) => s.project.width);
  const height = useEditor((s) => s.project.height);
  const canvasValue = `${width}x${height}`;
  const knownPreset = CANVAS_PRESETS.some((p) => `${p.w}x${p.h}` === canvasValue);

  const openExportDialog = useEditor((s) => s.openExportDialog);
  const isExporting = useEditor((s) => s.isExporting);
  const support = checkExportSupport();

  const saveProjectFile = useEditor((s) => s.saveProjectFile);
  const openProjectFile = useEditor((s) => s.openProjectFile);
  const openInputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="toolbar">
      <div className="toolbar__group">
        <span className="toolbar__brand">🎬</span>
        <input
          className="toolbar__name"
          value={projectName}
          spellCheck={false}
          onChange={(e) => renameProject(e.target.value)}
          aria-label="Project name"
        />
      </div>

      <div className="toolbar__group">
        <button className="btn" onClick={togglePlay} data-tip="Play / pause the preview (Space).">
          {isPlaying ? '❚❚ Pause' : '▶ Play'}
        </button>
        <span className="toolbar__time">{formatTimecode(playhead, fps)}</span>
      </div>

      <div className="toolbar__group">
        <button className="btn" onClick={undo} disabled={!canUndo} data-tip="Undo the last change (⌘/Ctrl+Z).">
          ↶ Undo
        </button>
        <button className="btn" onClick={redo} disabled={!canRedo} data-tip="Redo (⌘/Ctrl+Shift+Z).">
          ↷ Redo
        </button>
        <button
          className="btn"
          onClick={split}
          disabled={!hasSelection}
          data-tip="Cut the selected clip in two at the playhead (S)."
        >
          ✂ Split
        </button>
        <button
          className="btn"
          onClick={duplicate}
          disabled={!hasSelection}
          data-tip="Duplicate the selected clip or overlay (⌘/Ctrl+D)."
        >
          ⧉ Duplicate
        </button>
        <button
          className="btn"
          onClick={remove}
          disabled={!hasSelection}
          data-tip="Delete the selected clip or overlay (Delete)."
        >
          🗑 Delete
        </button>
        <button className="btn" onClick={addText} data-tip="Add a text title you can place anywhere on the preview.">
          T Add text
        </button>
        <button className="btn" onClick={addCaption} data-tip="Add a centered, outlined subtitle near the bottom.">
          CC Caption
        </button>
        <button
          className="btn"
          onClick={() => void autoCaption()}
          disabled={isTranscribing}
          data-tip="Transcribe the audio into captions automatically, on your device."
        >
          ✨ Auto-caption
        </button>
        <button className="btn" onClick={addShape} data-tip="Add a colored rectangle / block (background bar or highlight).">
          ▭ Shape
        </button>
        <button className="btn" onClick={addLowerThird} data-tip="Add a name bar: a colored bar with text near the bottom.">
          ▬ Lower third
        </button>
      </div>

      <div className="toolbar__group">
        <span className="toolbar__label">Tracks</span>
        <button
          className="btn btn--sm"
          onClick={() => addTrack('video')}
          data-tip="Add another video row to stack clips/overlays."
        >
          + Video
        </button>
        <button
          className="btn btn--sm"
          onClick={() => addTrack('audio')}
          data-tip="Add another audio row (e.g. voice on one, music on another)."
        >
          + Audio
        </button>
      </div>

      <div className="toolbar__group toolbar__group--right">
        <label
          className="toolbar__label"
          data-tip="Output shape: 16:9 landscape, 9:16 vertical (Reels/TikTok), 1:1 square."
        >
          Canvas
          <select
            className="toolbar__select"
            value={knownPreset ? canvasValue : 'custom'}
            onChange={(e) => {
              const preset = CANVAS_PRESETS.find((p) => `${p.w}x${p.h}` === e.target.value);
              if (preset) setCanvasSize(preset.w, preset.h);
            }}
          >
            {!knownPreset && <option value="custom">{canvasValue}</option>}
            {CANVAS_PRESETS.map((p) => (
              <option key={p.label} value={`${p.w}x${p.h}`}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label
          className="toolbar__zoom"
          data-tip="Stretch the timeline to see more or less detail per second."
        >
          Zoom
          <input
            type="range"
            min={1}
            max={30}
            step={0.5}
            value={pxPerFrame}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
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
            e.target.value = ''; // allow re-opening the same file
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
