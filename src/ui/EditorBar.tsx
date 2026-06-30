/**
 * ui/EditorBar — the action bar directly above the timeline: transport + the
 * clip/track editing actions + snapping + zoom.
 */
import { useEditor } from '../store/editorStore';
import { formatTimecode } from '../core/time';

export function EditorBar() {
  const isPlaying = useEditor((s) => s.isPlaying);
  const togglePlay = useEditor((s) => s.togglePlay);
  const playhead = useEditor((s) => s.playhead);
  const fps = useEditor((s) => s.project.fps);

  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);

  const split = useEditor((s) => s.splitSelectedAtPlayhead);
  const duplicate = useEditor((s) => s.duplicateSelected);
  const remove = useEditor((s) => s.removeSelected);
  const hasSelection = useEditor((s) => Boolean(s.selectedClipId || s.selectedEffectId));

  const addTrack = useEditor((s) => s.addTrack);
  const snappingEnabled = useEditor((s) => s.snappingEnabled);
  const toggleSnapping = useEditor((s) => s.toggleSnapping);
  const pxPerFrame = useEditor((s) => s.pxPerFrame);
  const setZoom = useEditor((s) => s.setZoom);

  return (
    <div className="editbar">
      <div className="editbar__group">
        <button
          className="iconbtn iconbtn--play"
          onClick={togglePlay}
          data-tip="Play / pause the preview (Space)."
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <span className="toolbar__time">{formatTimecode(playhead, fps)}</span>
      </div>

      <div className="editbar__sep" />

      <div className="editbar__group">
        <button
          className="iconbtn"
          onClick={undo}
          disabled={!canUndo}
          aria-label="Undo"
          data-tip="Undo (⌘/Ctrl+Z)."
        >
          ↶
        </button>
        <button
          className="iconbtn"
          onClick={redo}
          disabled={!canRedo}
          aria-label="Redo"
          data-tip="Redo (⌘/Ctrl+Shift+Z)."
        >
          ↷
        </button>
        <button
          className="iconbtn"
          onClick={split}
          disabled={!hasSelection}
          data-tip="Cut the selected clip in two at the playhead (S)."
        >
          ✂ Split
        </button>
        <button
          className="iconbtn"
          onClick={duplicate}
          disabled={!hasSelection}
          data-tip="Duplicate the selected clip or overlay (⌘/Ctrl+D)."
        >
          ⧉ Duplicate
        </button>
        <button
          className="iconbtn"
          onClick={remove}
          disabled={!hasSelection}
          data-tip="Delete the selected clip or overlay (Delete)."
        >
          🗑 Delete
        </button>
      </div>

      <div className="editbar__sep" />

      <div className="editbar__group">
        <button
          className="iconbtn"
          onClick={() => addTrack('video')}
          data-tip="Add another video row to stack clips/overlays."
        >
          + Video
        </button>
        <button
          className="iconbtn"
          onClick={() => addTrack('audio')}
          data-tip="Add another audio row (e.g. voice on one, music on another)."
        >
          + Audio
        </button>
      </div>

      <div className="editbar__group editbar__group--right">
        <button
          className={`tl-toggle${snappingEnabled ? ' is-on' : ''}`}
          onClick={toggleSnapping}
          data-tip="Snapping: when ON, dragging a clip makes its edges stick to other clips, the playhead and the start. Turn OFF for free placement."
        >
          🧲 Snap {snappingEnabled ? 'on' : 'off'}
        </button>
        <label className="toolbar__zoom" data-tip="Stretch the timeline to see more or less detail per second.">
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
      </div>
    </div>
  );
}
