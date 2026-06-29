/**
 * ui/Toolbar — transport + editing actions across the top.
 */
import { useEditor } from '../store/editorStore';
import { formatTimecode } from '../core/time';
import { checkExportSupport } from '../render/capabilities';

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
  const remove = useEditor((s) => s.removeSelected);
  const addText = useEditor((s) => s.addTextEffect);
  const addCaption = useEditor((s) => s.addCaption);
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
        <button className="btn" onClick={togglePlay}>
          {isPlaying ? '❚❚ Pause' : '▶ Play'}
        </button>
        <span className="toolbar__time">{formatTimecode(playhead, fps)}</span>
      </div>

      <div className="toolbar__group">
        <button className="btn" onClick={undo} disabled={!canUndo}>
          ↶ Undo
        </button>
        <button className="btn" onClick={redo} disabled={!canRedo}>
          ↷ Redo
        </button>
        <button className="btn" onClick={split} disabled={!hasSelection} title="Split at playhead">
          ✂ Split
        </button>
        <button className="btn" onClick={remove} disabled={!hasSelection}>
          🗑 Delete
        </button>
        <button className="btn" onClick={addText}>
          T Add text
        </button>
        <button className="btn" onClick={addCaption}>
          CC Caption
        </button>
        <button
          className="btn"
          onClick={() => void autoCaption()}
          disabled={isTranscribing}
          title="Transcribe the audio into captions (on-device)"
        >
          ✨ Auto-caption
        </button>
      </div>

      <div className="toolbar__group">
        <span className="toolbar__label">Tracks</span>
        <button className="btn btn--sm" onClick={() => addTrack('video')} title="Add a video track">
          + Video
        </button>
        <button className="btn btn--sm" onClick={() => addTrack('audio')} title="Add an audio track">
          + Audio
        </button>
      </div>

      <div className="toolbar__group toolbar__group--right">
        <label className="toolbar__label" title="Canvas size / aspect ratio">
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
        <label className="toolbar__zoom">
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
          className="btn btn--primary"
          onClick={openExportDialog}
          disabled={isExporting || !support.supported}
          title={support.reason}
        >
          ⬇ Export
        </button>
      </div>
    </header>
  );
}
