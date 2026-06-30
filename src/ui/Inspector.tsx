/**
 * ui/Inspector — context panel for the current selection.
 *
 * For a text effect it edits the props the user asked for (text, size, weight,
 * color, alignment) + the overlay's timing. For a clip it shows source info and
 * lets you set an image's on-screen duration. This panel is intentionally thin:
 * when new effect types arrive, each contributes its own editor here.
 */
import {
  useEditor,
  useSelectedClip,
  useSelectedTextEffect,
  useSelectedCaption,
  useSelectedShape,
} from '../store/editorStore';
import { framesToSeconds, secondsToFrames } from '../core/time';
import type { TransitionType, KenBurns } from '../core/model';

function TextEffectEditor() {
  const effect = useSelectedTextEffect();
  const project = useEditor((s) => s.project);
  const update = useEditor((s) => s.updateTextEffect);
  if (!effect) return null;

  const durationSeconds = framesToSeconds(effect.timing.duration, project.fps);

  return (
    <div className="inspector__group">
      <h3>Text overlay</h3>
      <label className="field">
        <span>Text</span>
        <textarea
          rows={2}
          value={effect.text}
          onChange={(e) => update(effect.id, { text: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Font size</span>
        <input
          type="number"
          min={8}
          value={effect.fontSize}
          onChange={(e) => update(effect.id, { fontSize: Number(e.target.value) })}
        />
      </label>
      <label className="field">
        <span>Weight</span>
        <select
          value={effect.fontWeight}
          onChange={(e) => update(effect.id, { fontWeight: Number(e.target.value) })}
        >
          {[300, 400, 500, 600, 700, 800, 900].map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Color</span>
        <input
          type="color"
          value={effect.color}
          onChange={(e) => update(effect.id, { color: e.target.value })}
        />
      </label>
      <p className="inspector__hint">Drag the text on the preview to move it; drag a corner to resize.</p>
      <label className="field">
        <span>Duration (s)</span>
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={durationSeconds.toFixed(1)}
          onChange={(e) =>
            update(effect.id, {
              timing: {
                start: effect.timing.start,
                duration: Math.max(1, secondsToFrames(Number(e.target.value), project.fps)),
              },
            })
          }
        />
      </label>
    </div>
  );
}

function ClipEditor() {
  const clip = useSelectedClip();
  const project = useEditor((s) => s.project);
  const setClipDuration = useEditor((s) => s.setClipDuration);
  const setClipTransform = useEditor((s) => s.setClipTransform);
  const setClipGain = useEditor((s) => s.setClipGain);
  const setClipDuck = useEditor((s) => s.setClipDuck);
  const setClipFade = useEditor((s) => s.setClipFade);
  const setClipSpeed = useEditor((s) => s.setClipSpeed);
  const setClipTransition = useEditor((s) => s.setClipTransition);
  const setClipMotion = useEditor((s) => s.setClipMotion);
  const addTransition = useEditor((s) => s.addTransition);
  if (!clip) return null;

  const media = project.media[clip.mediaId];
  const seconds = framesToSeconds(clip.durationInFrames, project.fps);
  const isVisual = clip.kind === 'image' || clip.kind === 'video';
  const hasSpeed = clip.kind === 'video' || clip.kind === 'audio';
  const track = project.tracks[clip.trackId];
  const hasPrev = track ? track.clipOrder.indexOf(clip.id) > 0 : false;

  return (
    <div className="inspector__group">
      <h3>Clip</h3>
      <p className="inspector__row">{media?.name ?? clip.mediaId}</p>
      <p className="inspector__row">
        start {clip.startFrame}f · {clip.durationInFrames}f
      </p>
      {hasSpeed && (
        <label className="field">
          <span>Speed</span>
          <select
            value={clip.speed}
            onChange={(e) => setClipSpeed(clip.id, Number(e.target.value))}
          >
            {[0.25, 0.5, 1, 1.5, 2, 4].map((s) => (
              <option key={s} value={s}>
                {s}×{s < 1 ? ' (slow-mo)' : s > 1 ? ' (fast)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {clip.kind === 'image' && (
        <label className="field">
          <span>Duration (s)</span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={seconds.toFixed(1)}
            onChange={(e) =>
              setClipDuration(clip.id, secondsToFrames(Number(e.target.value), project.fps))
            }
          />
        </label>
      )}
      {(clip.kind === 'image' || clip.kind === 'video') && (
        <>
          <label className="field">
            <span>Motion (Ken Burns)</span>
            <select
              value={clip.motion}
              onChange={(e) => setClipMotion(clip.id, e.target.value as KenBurns)}
            >
              <option value="none">None</option>
              <option value="zoomIn">Zoom in</option>
              <option value="zoomOut">Zoom out</option>
              <option value="panLeft">Pan left</option>
              <option value="panRight">Pan right</option>
            </select>
          </label>
          <label className="field">
            <span>Transition</span>
            <select
              value={clip.transition}
              onChange={(e) => setClipTransition(clip.id, e.target.value as TransitionType)}
            >
              <option value="dissolve">Dissolve</option>
              <option value="wipe">Wipe</option>
              <option value="slide">Slide</option>
            </select>
          </label>
        </>
      )}
      {isVisual && hasPrev && (
        <button className="btn btn--block" onClick={addTransition}>
          ⇄ Add transition (overlap previous)
        </button>
      )}
      {isVisual && (
        <>
          <p className="inspector__hint">Drag on the preview to move; drag a corner to resize.</p>
          <label className="field">
            <span>Opacity ({Math.round(clip.transform.opacity * 100)}%)</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={clip.transform.opacity}
              onChange={(e) =>
                setClipTransform(clip.id, { ...clip.transform, opacity: Number(e.target.value) })
              }
            />
          </label>
        </>
      )}
      {clip.kind === 'audio' && (
        <>
          <label className="field">
            <span>Volume ({Math.round(clip.gain * 100)}%)</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={clip.gain}
              onChange={(e) => setClipGain(clip.id, Number(e.target.value))}
            />
          </label>
          <label className="field-check">
            <input
              type="checkbox"
              checked={clip.duck}
              onChange={(e) => setClipDuck(clip.id, e.target.checked)}
            />
            <span>Duck under voice (lower while other audio plays)</span>
          </label>
        </>
      )}
      <div className="field-row">
        <label className="field">
          <span>Fade in (s)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={framesToSeconds(clip.fadeInFrames, project.fps).toFixed(1)}
            onChange={(e) =>
              setClipFade(clip.id, { fadeInFrames: secondsToFrames(Number(e.target.value), project.fps) })
            }
          />
        </label>
        <label className="field">
          <span>Fade out (s)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={framesToSeconds(clip.fadeOutFrames, project.fps).toFixed(1)}
            onChange={(e) =>
              setClipFade(clip.id, { fadeOutFrames: secondsToFrames(Number(e.target.value), project.fps) })
            }
          />
        </label>
      </div>
    </div>
  );
}

function CaptionEditor() {
  const caption = useSelectedCaption();
  const project = useEditor((s) => s.project);
  const update = useEditor((s) => s.updateTextEffect);
  if (!caption) return null;
  const durationSeconds = framesToSeconds(caption.timing.duration, project.fps);
  return (
    <div className="inspector__group">
      <h3>Caption</h3>
      <label className="field">
        <span>Text</span>
        <textarea
          rows={2}
          value={caption.text}
          onChange={(e) => update(caption.id, { text: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Font size</span>
        <input
          type="number"
          min={8}
          value={caption.fontSize}
          onChange={(e) => update(caption.id, { fontSize: Number(e.target.value) })}
        />
      </label>
      <label className="field">
        <span>Color</span>
        <input
          type="color"
          value={caption.color}
          onChange={(e) => update(caption.id, { color: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Duration (s)</span>
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={durationSeconds.toFixed(1)}
          onChange={(e) =>
            update(caption.id, {
              timing: {
                start: caption.timing.start,
                duration: Math.max(1, secondsToFrames(Number(e.target.value), project.fps)),
              },
            })
          }
        />
      </label>
      <p className="inspector__hint">
        Captions appear centered near the bottom with an outline for readability.
      </p>
    </div>
  );
}

function ShapeEditor() {
  const shape = useSelectedShape();
  const project = useEditor((s) => s.project);
  const update = useEditor((s) => s.updateShape);
  if (!shape) return null;
  const durationSeconds = framesToSeconds(shape.timing.duration, project.fps);
  return (
    <div className="inspector__group">
      <h3>Shape</h3>
      <label className="field">
        <span>Color</span>
        <input
          type="color"
          value={shape.color}
          onChange={(e) => update(shape.id, { color: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Opacity ({Math.round(shape.opacity * 100)}%)</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={shape.opacity}
          onChange={(e) => update(shape.id, { opacity: Number(e.target.value) })}
        />
      </label>
      <label className="field">
        <span>Duration (s)</span>
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={durationSeconds.toFixed(1)}
          onChange={(e) =>
            update(shape.id, {
              timing: {
                start: shape.timing.start,
                duration: Math.max(1, secondsToFrames(Number(e.target.value), project.fps)),
              },
            })
          }
        />
      </label>
      <p className="inspector__hint">Drag on the preview to move; drag a corner to resize.</p>
    </div>
  );
}

function OverlaysList() {
  const effects = useEditor((s) => s.project.effects);
  const selectEffect = useEditor((s) => s.selectEffect);
  const removeEffect = useEditor((s) => s.removeEffect);
  const list = Object.values(effects);
  if (list.length === 0) return null;
  return (
    <div className="inspector__group">
      <h3>Overlays</h3>
      <ul className="overlays">
        {list.map((e) => (
          <li key={e.id} className="overlays__item">
            <button className="overlays__select" onClick={() => selectEffect(e.id)}>
              <span className="overlays__type">
                {e.type === 'caption' ? 'CC' : e.type === 'shape' ? '▭' : 'T'}
              </span>
              <span className="overlays__text">
                {e.type === 'shape' ? 'Shape' : e.text || '(empty)'}
              </span>
            </button>
            <button
              className="overlays__delete"
              aria-label="Delete overlay"
              title="Delete overlay"
              onClick={() => removeEffect(e.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectEditor() {
  const project = useEditor((s) => s.project);
  const setBackground = useEditor((s) => s.setBackground);
  const setFps = useEditor((s) => s.setFps);
  return (
    <div className="inspector__group">
      <h3>Project</h3>
      <p className="inspector__row">{project.name}</p>
      <p className="inspector__row">
        {project.width}×{project.height}
      </p>
      <label className="field">
        <span>Frame rate</span>
        <select value={project.fps} onChange={(e) => setFps(Number(e.target.value))}>
          {[24, 25, 30, 50, 60].map((f) => (
            <option key={f} value={f}>
              {f} fps
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Background</span>
        <input
          type="color"
          value={project.background ?? '#000000'}
          onChange={(e) => setBackground(e.target.value)}
        />
      </label>
      <p className="inspector__hint">Select a clip or text overlay to edit it.</p>
    </div>
  );
}

export function Inspector() {
  const text = useSelectedTextEffect();
  const caption = useSelectedCaption();
  const shape = useSelectedShape();
  const clip = useSelectedClip();

  return (
    <aside className="inspector">
      {text ? (
        <TextEffectEditor />
      ) : caption ? (
        <CaptionEditor />
      ) : shape ? (
        <ShapeEditor />
      ) : clip ? (
        <ClipEditor />
      ) : (
        <>
          <ProjectEditor />
          <OverlaysList />
        </>
      )}
    </aside>
  );
}
