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
  useSelectedImageEffect,
} from '../store/editorStore';
import { framesToSeconds, secondsToFrames } from '../core/time';
import { containedBox, coverBox } from '../core/model';
import type { TransitionType, KenBurns } from '../core/model';
import type { EffectId } from '../core/ids';
import { HelpLink } from './HelpDialog';
import { ScrollArea } from './ScrollArea';

const WEIGHT_NAMES: Record<number, string> = {
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semibold',
  700: 'Bold',
  800: 'Extra bold',
  900: 'Black',
};

/** Fade in/out (seconds) for a timed overlay — shared by text/caption/shape. */
function OverlayFadeFields({
  effectId,
  fadeInFrames,
  fadeOutFrames,
  fps,
  update,
}: {
  effectId: EffectId;
  fadeInFrames?: number;
  fadeOutFrames?: number;
  fps: number;
  update: (id: EffectId, patch: { fadeInFrames?: number; fadeOutFrames?: number }) => void;
}) {
  return (
    <div className="field-row">
      <label className="field">
        <span>Fade in (s)</span>
        <input
          type="number"
          min={0}
          step={0.1}
          value={framesToSeconds(fadeInFrames ?? 0, fps).toFixed(1)}
          onChange={(e) =>
            update(effectId, { fadeInFrames: secondsToFrames(Number(e.target.value), fps) })
          }
        />
      </label>
      <label className="field">
        <span>Fade out (s)</span>
        <input
          type="number"
          min={0}
          step={0.1}
          value={framesToSeconds(fadeOutFrames ?? 0, fps).toFixed(1)}
          onChange={(e) =>
            update(effectId, { fadeOutFrames: secondsToFrames(Number(e.target.value), fps) })
          }
        />
      </label>
    </div>
  );
}

function TextEffectEditor() {
  const effect = useSelectedTextEffect();
  const project = useEditor((s) => s.project);
  const update = useEditor((s) => s.updateTextEffect);
  if (!effect) return null;

  const durationSeconds = framesToSeconds(effect.timing.duration, project.fps);

  return (
    <div className="inspector__group">
      <h3 className="inspector__title">
        Text overlay <HelpLink topic="Text overlay" />
      </h3>
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
              {WEIGHT_NAMES[w]} ({w})
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
      <div className="inspector__sub">
        <div className="inspector__subhead">
          <span>Readability</span>
        </div>
        <label
          className="field-check"
          data-tip="A padded colored box behind the text so it reads on any footage."
        >
          <input
            type="checkbox"
            checked={effect.background != null}
            onChange={(e) =>
              update(effect.id, { background: e.target.checked ? '#000000' : undefined })
            }
          />
          <span>Background box</span>
        </label>
        {effect.background != null && (
          <>
            <label className="field">
              <span>Box color</span>
              <input
                type="color"
                value={effect.background}
                onChange={(e) => update(effect.id, { background: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Box opacity ({Math.round((effect.backgroundOpacity ?? 0.55) * 100)}%)</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={effect.backgroundOpacity ?? 0.55}
                onChange={(e) => update(effect.id, { backgroundOpacity: Number(e.target.value) })}
              />
            </label>
          </>
        )}
        <label className="field-check" data-tip="A dark outline around the letters (caption-style).">
          <input
            type="checkbox"
            checked={!!effect.outline}
            onChange={(e) => update(effect.id, { outline: e.target.checked || undefined })}
          />
          <span>Outline</span>
        </label>
        <label className="field-check" data-tip="A soft drop shadow under the letters.">
          <input
            type="checkbox"
            checked={!!effect.shadow}
            onChange={(e) => update(effect.id, { shadow: e.target.checked || undefined })}
          />
          <span>Shadow</span>
        </label>
      </div>
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
      <OverlayFadeFields
        effectId={effect.id}
        fadeInFrames={effect.fadeInFrames}
        fadeOutFrames={effect.fadeOutFrames}
        fps={project.fps}
        update={update}
      />
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
  const setClipAdjust = useEditor((s) => s.setClipAdjust);
  const fitClip = useEditor((s) => s.fitClip);
  const addTransition = useEditor((s) => s.addTransition);
  if (!clip) return null;

  const media = project.media[clip.mediaId];
  const seconds = framesToSeconds(clip.durationInFrames, project.fps);
  const isVisual = clip.kind === 'image' || clip.kind === 'video';
  const hasSpeed = clip.kind === 'video' || clip.kind === 'audio';
  const track = project.tracks[clip.trackId];
  const hasPrev = track ? track.clipOrder.indexOf(clip.id) > 0 : false;

  // Which frame-fit mode the current transform matches (for the active state).
  const near = (a: number, b: number) => Math.abs(a - b) < 1.5;
  const boxEq = (b: { x: number; y: number; width: number; height: number }) =>
    isVisual &&
    near(clip.transform.x, b.x) &&
    near(clip.transform.y, b.y) &&
    near(clip.transform.width, b.width) &&
    near(clip.transform.height, b.height);
  const natW = media?.width ?? project.width;
  const natH = media?.height ?? project.height;
  const fitMode = !isVisual
    ? null
    : boxEq(containedBox(natW, natH, project.width, project.height))
      ? 'contain'
      : boxEq(coverBox(natW, natH, project.width, project.height))
        ? 'cover'
        : boxEq({ x: 0, y: 0, width: project.width, height: project.height })
          ? 'stretch'
          : null;

  return (
    <div className="inspector__group">
      <h3 className="inspector__title">
        Clip <HelpLink topic="Trim" />
      </h3>
      <p className="inspector__row">{media?.name ?? clip.mediaId}</p>
      <p
        className="inspector__row"
        data-tip={`Frames: starts at ${clip.startFrame}, ${clip.durationInFrames} long.`}
      >
        starts at {framesToSeconds(clip.startFrame, project.fps).toFixed(1)}s ·{' '}
        {seconds.toFixed(1)}s long
      </p>
      {hasSpeed && (
        <label
          className="field"
          data-tip="Playback speed. 2× is twice as fast (and half as long on the timeline); 0.5× is slow-motion."
        >
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
      <label
        className="field"
        data-tip="Set the clip's length on the timeline. The handy way to resize a clip whose edge is scrolled off-screen. Video/audio is capped at the source's remaining length."
      >
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
      {(clip.kind === 'image' || clip.kind === 'video') && (
        <>
          <label
            className="field"
            data-tip="Ken Burns: a slow pan/zoom over the clip so still photos feel alive. It animates while playing + in the export."
          >
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
          <label
            className="field"
            data-tip="How this clip blends in where it OVERLAPS the previous clip. Dissolve = cross-fade, Wipe = revealed left-to-right, Slide = slides in. Needs an overlap (use ‘Add transition’)."
          >
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
        <button
          className="btn btn--block"
          onClick={addTransition}
          data-tip="Overlaps this clip with the one before it by ~0.5s to create a transition region, then pick a style above."
        >
          ⇄ Add transition (overlap previous)
        </button>
      )}
      {isVisual && (
        <>
          <label
            className="field"
            data-tip="How the clip maps into the canvas. Fit = whole image with bars; Fill = crop to fill (great for a landscape photo in a vertical video); Stretch = force-fit."
          >
            <span>Frame fit</span>
            <div className="field-row">
              <button
                className={`btn btn--mini${fitMode === 'contain' ? ' is-active' : ''}`}
                onClick={() => fitClip(clip.id, 'contain')}
              >
                Fit
              </button>
              <button
                className={`btn btn--mini${fitMode === 'cover' ? ' is-active' : ''}`}
                onClick={() => fitClip(clip.id, 'cover')}
              >
                Fill
              </button>
              <button
                className={`btn btn--mini${fitMode === 'stretch' ? ' is-active' : ''}`}
                onClick={() => fitClip(clip.id, 'stretch')}
              >
                Stretch
              </button>
            </div>
          </label>
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
      {isVisual && (
        <div className="inspector__sub">
          <div className="inspector__subhead">
            <span>Color</span>
            <button
              className="btn btn--mini"
              onClick={() =>
                setClipAdjust(clip.id, { brightness: 1, contrast: 1, saturate: 1 })
              }
            >
              Reset
            </button>
          </div>
          <label className="field">
            <span>Brightness ({Math.round(clip.adjust.brightness * 100)}%)</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={clip.adjust.brightness}
              onChange={(e) => setClipAdjust(clip.id, { brightness: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Contrast ({Math.round(clip.adjust.contrast * 100)}%)</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={clip.adjust.contrast}
              onChange={(e) => setClipAdjust(clip.id, { contrast: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Saturation ({Math.round(clip.adjust.saturate * 100)}%)</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={clip.adjust.saturate}
              onChange={(e) => setClipAdjust(clip.id, { saturate: Number(e.target.value) })}
            />
          </label>
          <div className="field-row">
            <button
              className="btn btn--mini"
              onClick={() => setClipAdjust(clip.id, { saturate: 0 })}
            >
              B&amp;W
            </button>
            <button
              className="btn btn--mini"
              onClick={() =>
                setClipAdjust(clip.id, { saturate: 1.4, contrast: 1.15, brightness: 1.05 })
              }
            >
              Vivid
            </button>
          </div>
        </div>
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
          <label
            className="field-check"
            data-tip="Auto-lowers THIS clip’s volume whenever other (non-ducked) audio — your voice — is playing, so narration stays clear. Use it on music."
          >
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
      <h3 className="inspector__title">
        Caption <HelpLink topic="Caption" />
      </h3>
      <label className="field">
        <span>Text</span>
        <textarea
          rows={2}
          value={caption.text}
          // Editing the text invalidates any speech-synced word timings —
          // drop them so karaoke falls back to the even distribution.
          onChange={(e) => update(caption.id, { text: e.target.value, words: undefined } as never)}
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
      <label
        className="field-check"
        data-tip="Karaoke: highlight each word in turn as it's spoken (Reels/TikTok style)."
      >
        <input
          type="checkbox"
          checked={!!caption.karaoke}
          onChange={(e) => update(caption.id, { karaoke: e.target.checked } as never)}
        />
        <span>Karaoke (highlight words)</span>
      </label>
      {caption.karaoke && (
        <label className="field">
          <span>Highlight color</span>
          <input
            type="color"
            value={caption.highlightColor ?? '#ffd400'}
            onChange={(e) => update(caption.id, { highlightColor: e.target.value } as never)}
          />
        </label>
      )}
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
      <OverlayFadeFields
        effectId={caption.id}
        fadeInFrames={caption.fadeInFrames}
        fadeOutFrames={caption.fadeOutFrames}
        fps={project.fps}
        update={update}
      />
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
      <h3 className="inspector__title">
        Shape <HelpLink topic="Shape" />
      </h3>
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
      <OverlayFadeFields
        effectId={shape.id}
        fadeInFrames={shape.fadeInFrames}
        fadeOutFrames={shape.fadeOutFrames}
        fps={project.fps}
        update={update}
      />
      <p className="inspector__hint">Drag on the preview to move; drag a corner to resize.</p>
    </div>
  );
}

function ImageEffectEditor() {
  const effect = useSelectedImageEffect();
  const project = useEditor((s) => s.project);
  const update = useEditor((s) => s.updateImageOverlay);
  if (!effect) return null;
  const media = project.media[effect.mediaId];
  const durationSeconds = framesToSeconds(effect.timing.duration, project.fps);
  return (
    <div className="inspector__group">
      <h3 className="inspector__title">Image overlay</h3>
      <p className="inspector__row">{media?.name ?? effect.mediaId}</p>
      <label className="field">
        <span>Opacity ({Math.round(effect.opacity * 100)}%)</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={effect.opacity}
          onChange={(e) => update(effect.id, { opacity: Number(e.target.value) })}
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
            update(effect.id, {
              timing: {
                start: effect.timing.start,
                duration: Math.max(1, secondsToFrames(Number(e.target.value), project.fps)),
              },
            })
          }
        />
      </label>
      <OverlayFadeFields
        effectId={effect.id}
        fadeInFrames={effect.fadeInFrames}
        fadeOutFrames={effect.fadeOutFrames}
        fps={project.fps}
        update={update}
      />
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
                {e.type === 'caption'
                  ? 'CC'
                  : e.type === 'shape'
                    ? '▭'
                    : e.type === 'image'
                      ? '🖼'
                      : 'T'}
              </span>
              <span className="overlays__text">
                {e.type === 'shape'
                  ? 'Shape'
                  : e.type === 'image'
                    ? 'Image'
                    : e.text || '(empty)'}
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

export function Inspector() {
  const text = useSelectedTextEffect();
  const caption = useSelectedCaption();
  const shape = useSelectedShape();
  const image = useSelectedImageEffect();
  const clip = useSelectedClip();

  const hasOverlays = useEditor((s) => Object.keys(s.project.effects).length > 0);

  return (
    <aside className="inspector">
      <ScrollArea className="inspector__scroll" orientation="vertical">
        <div className="inspector__body">
          {text ? (
            <TextEffectEditor />
          ) : caption ? (
            <CaptionEditor />
          ) : shape ? (
            <ShapeEditor />
          ) : image ? (
            <ImageEffectEditor />
          ) : clip ? (
            <ClipEditor />
          ) : (
            <>
              <div className="inspector__empty">
                <div className="inspector__empty-icon">⚙</div>
                <p className="inspector__empty-title">Nothing selected</p>
                <p className="inspector__empty-sub">
                  Click a clip or overlay on the timeline (or an element on the preview) to edit
                  its properties. Project size and background live in the Settings panel (left).
                </p>
              </div>
              {hasOverlays && <OverlaysList />}
            </>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
