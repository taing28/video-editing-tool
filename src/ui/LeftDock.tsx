/**
 * ui/LeftDock — a vertical icon rail + a switchable panel (Designcombo-style).
 *
 * The rail picks a category; the panel shows that category's tools: Media,
 * Text, Captions, Elements (shapes + stickers), Adjust, Settings. Clicking the
 * active rail icon collapses the panel. The panel is drag-resizable.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useEditor, useSelectedClip } from '../store/editorStore';
import { MediaLibrary } from './MediaLibrary';
import { HelpLink } from './HelpDialog';
import { ScrollArea } from './ScrollArea';
import { startRecording, type RecorderHandle } from '../media/recorder';

type PanelId = 'media' | 'record' | 'text' | 'captions' | 'elements' | 'adjust' | 'settings';

const RAIL: { id: PanelId; icon: string; label: string; tip: string }[] = [
  { id: 'media', icon: '🎞', label: 'Media', tip: 'Your imported images, video and audio.' },
  { id: 'record', icon: '🎙', label: 'Record', tip: 'Record a voiceover with your microphone.' },
  { id: 'text', icon: 'T', label: 'Text', tip: 'Add titles and text overlays.' },
  { id: 'captions', icon: 'CC', label: 'Captions', tip: 'Add subtitles, or auto-transcribe audio.' },
  { id: 'elements', icon: '⬡', label: 'Elements', tip: 'Shapes, lower-thirds and emoji stickers.' },
  { id: 'adjust', icon: '🎚', label: 'Adjust', tip: 'Color-grade the selected clip.' },
  { id: 'settings', icon: '⚙', label: 'Settings', tip: 'Project size, frame rate and background.' },
];

const MIN_W = 220;
const MAX_W = 460;
const STICKERS = ['⭐', '❤️', '🔥', '😂', '😮', '👍', '🎉', '✅', '❓', '💯', '👀', '😎'];

const CANVAS_PRESETS = [
  { label: '16:9 · Landscape', w: 1920, h: 1080 },
  { label: '9:16 · Vertical', w: 1080, h: 1920 },
  { label: '1:1 · Square', w: 1080, h: 1080 },
  { label: '4:3 · Classic', w: 1440, h: 1080 },
];

export function LeftDock() {
  const [active, setActive] = useState<PanelId | null>(() => {
    try {
      return (localStorage.getItem('dock:active') as PanelId) || 'media';
    } catch {
      return 'media';
    }
  });
  const [width, setWidth] = useState(() => {
    try {
      const v = Number(localStorage.getItem('dock:w'));
      return v >= MIN_W && v <= MAX_W ? v : 260;
    } catch {
      return 260;
    }
  });
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    try {
      localStorage.setItem('dock:w', String(width));
      localStorage.setItem('dock:active', active ?? '');
    } catch {
      /* ignore */
    }
  }, [width, active]);

  // Keyboard panel switching: digits 1..N dispatched from the global shortcut
  // handler. Pressing the active panel's digit again collapses it.
  useEffect(() => {
    const onPanel = (e: Event) => {
      const n = (e as CustomEvent<number>).detail;
      const id = RAIL[n - 1]?.id;
      if (id) setActive((a) => (a === id ? null : id));
    };
    window.addEventListener('dock-panel', onPanel);
    return () => window.removeEventListener('dock-panel', onPanel);
  }, []);

  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: PointerEvent) => {
      setWidth(Math.max(MIN_W, Math.min(MAX_W, Math.round(startW + (ev.clientX - startX)))));
    };
    const onUp = () => {
      setDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const current = RAIL.find((r) => r.id === active);

  return (
    <div className={`dock${dragging ? ' is-dragging' : ''}`}>
      <nav className="dock__rail" aria-label="Tools">
        {RAIL.map((r) => (
          <button
            key={r.id}
            className={`dock-rail__btn${active === r.id ? ' is-active' : ''}`}
            data-panel={r.id}
            data-tip={`${r.tip} (key ${RAIL.indexOf(r) + 1})`}
            aria-label={r.label}
            aria-pressed={active === r.id}
            onClick={() => setActive((a) => (a === r.id ? null : r.id))}
          >
            <span className="dock-rail__icon">{r.icon}</span>
            <span className="dock-rail__label">{r.label}</span>
          </button>
        ))}
      </nav>

      {active && current && (
        <div className="dock__panel" style={{ width }}>
          <div className="dock__panel-head">
            <span>{current.label}</span>
          </div>
          <div className="dock__panel-body">
            <ScrollArea className="dock__panel-scroll" orientation="vertical">
              {active === 'media' && <MediaLibrary />}
              {active === 'record' && <RecordPanel />}
              {active === 'text' && <TextPanel />}
              {active === 'captions' && <CaptionsPanel />}
              {active === 'elements' && <ElementsPanel />}
              {active === 'adjust' && <AdjustPanel />}
              {active === 'settings' && <SettingsPanel />}
            </ScrollArea>
          </div>
          <div
            className="dock__resize"
            onPointerDown={onResizeDown}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
          />
        </div>
      )}
    </div>
  );
}

function PanelSection({ children }: { children: ReactNode }) {
  return <div className="panel-pad">{children}</div>;
}

function RecordPanel() {
  const addRecordedVoiceover = useEditor((s) => s.addRecordedVoiceover);
  const pause = useEditor((s) => s.pause);
  const [rec, setRec] = useState<RecorderHandle | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const recRef = useRef<RecorderHandle | null>(null);
  recRef.current = rec;

  // Live meter + elapsed readout while recording.
  useEffect(() => {
    if (!rec) return;
    let raf = 0;
    const loop = () => {
      setLevel(rec.level());
      setElapsed((performance.now() - rec.startedAt) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [rec]);

  // Release the mic if the panel unmounts mid-recording.
  useEffect(() => () => recRef.current?.cancel(), []);

  const start = async () => {
    setError(null);
    pause(); // playback audio would bleed into the mic
    try {
      setRec(await startRecording());
      setElapsed(0);
    } catch {
      setError('Microphone unavailable — allow mic access in the browser and try again.');
    }
  };

  const stop = async () => {
    const r = rec;
    if (!r) return;
    setRec(null);
    setSaving(true);
    try {
      const file = await r.stop();
      await addRecordedVoiceover(file);
    } catch (err) {
      console.warn('Voiceover import failed:', err);
      setError('Could not save the recording.');
    }
    setSaving(false);
  };

  const cancel = () => {
    rec?.cancel();
    setRec(null);
  };

  return (
    <PanelSection>
      {!rec ? (
        <button
          className="panel-add rec__start"
          onClick={() => void start()}
          disabled={saving}
          data-tip="Record narration from your microphone. It lands on an audio track at the playhead."
        >
          <span className="panel-add__big rec__dot-idle">●</span>
          {saving ? 'Saving…' : 'Record voiceover'}
        </button>
      ) : (
        <div className="rec">
          <div className="rec__status">
            <span className="rec__dot" /> Recording · {elapsed.toFixed(1)}s
          </div>
          <div className="rec__meter">
            <div className="rec__meter-fill" style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <div className="field-row">
            <button className="btn btn--primary rec__stop" onClick={() => void stop()}>
              ■ Stop &amp; add
            </button>
            <button className="btn" onClick={cancel}>
              Discard
            </button>
          </div>
        </div>
      )}
      {error && <p className="panel-hint rec__error">{error}</p>}
      <p className="panel-hint">
        Move the playhead to where the narration should start, then record. The clip lands on an
        audio track (music with “Duck under voice” dips under it automatically).{' '}
        <HelpLink topic="Record voiceover" />
      </p>
    </PanelSection>
  );
}

function TextPanel() {
  const addText = useEditor((s) => s.addTextEffect);
  const addLowerThird = useEditor((s) => s.addLowerThird);
  return (
    <PanelSection>
      <button className="panel-add" onClick={addText} data-tip="Add a text title you can place anywhere.">
        <span className="panel-add__big">T</span>
        Add text
      </button>
      <button
        className="panel-add"
        onClick={addLowerThird}
        data-tip="A colored bar with text near the bottom (TV-style name caption)."
      >
        <span className="panel-add__big">▬</span>
        Lower third
      </button>
      <p className="panel-hint">
        After adding, drag it on the preview to position it; edit size, color and timing on the right.{' '}
        <HelpLink topic="Text overlay" />
      </p>
    </PanelSection>
  );
}

function CaptionsPanel() {
  const addCaption = useEditor((s) => s.addCaption);
  const autoCaption = useEditor((s) => s.autoCaption);
  const isTranscribing = useEditor((s) => s.isTranscribing);
  return (
    <PanelSection>
      <button className="panel-add" onClick={addCaption} data-tip="A centered, outlined subtitle near the bottom.">
        <span className="panel-add__big">CC</span>
        Add caption
      </button>
      <button
        className="panel-add"
        onClick={() => void autoCaption()}
        disabled={isTranscribing}
        data-tip="Transcribe the project audio into captions automatically, on your device."
      >
        <span className="panel-add__big">✨</span>
        {isTranscribing ? 'Transcribing…' : 'Auto-caption'}
      </button>
      <p className="panel-hint">
        Auto-caption listens to your audio on-device (no upload). The first run downloads a small model.{' '}
        <HelpLink topic="Auto-caption" />
      </p>
    </PanelSection>
  );
}

function ElementsPanel() {
  const addShape = useEditor((s) => s.addShape);
  const addLowerThird = useEditor((s) => s.addLowerThird);
  const addSticker = useEditor((s) => s.addSticker);
  const addImageOverlay = useEditor((s) => s.addImageOverlay);
  const media = useEditor((s) => s.project.media);
  const imageMedia = Object.values(media).filter((m) => m.kind === 'image');
  return (
    <PanelSection>
      <button className="panel-add" onClick={addShape} data-tip="A colored rectangle / block (background bar or highlight).">
        <span className="panel-add__big">▭</span>
        Shape
      </button>
      <button className="panel-add" onClick={addLowerThird} data-tip="A colored bar with text near the bottom.">
        <span className="panel-add__big">▬</span>
        Lower third
      </button>
      <div className="panel-subhead">Image overlay</div>
      {imageMedia.length === 0 ? (
        <p className="panel-hint">
          Import an image in the Media panel, then add it here as an overlay (e.g. a character)
          on top of your video.
        </p>
      ) : (
        <div className="overlay-img-grid">
          {imageMedia.map((m) => (
            <button
              key={m.id}
              className="overlay-img"
              onClick={() => addImageOverlay(m.id)}
              data-tip="Add this image as a timed overlay on top of the video."
              title={m.name}
              aria-label={`Add ${m.name} as an image overlay`}
            >
              <img src={m.src} alt="" />
              <span className="overlay-img__name">{m.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="panel-subhead">
        Stickers <HelpLink topic="Stickers" />
      </div>
      <div className="sticker-grid">
        {STICKERS.map((s) => (
          <button
            key={s}
            className="sticker"
            onClick={() => addSticker(s)}
            data-tip="Add this emoji as a sticker overlay."
            aria-label={`Add ${s} sticker`}
          >
            {s}
          </button>
        ))}
      </div>
    </PanelSection>
  );
}

function AdjustPanel() {
  const clip = useSelectedClip();
  const setClipAdjust = useEditor((s) => s.setClipAdjust);
  if (!clip || clip.kind === 'audio') {
    return (
      <PanelSection>
        <p className="panel-hint">
          Select an image or video clip on the timeline to grade its brightness, contrast and
          saturation. <HelpLink topic="Color grading" />
        </p>
      </PanelSection>
    );
  }
  const a = clip.adjust;
  const Slider = ({ label, k }: { label: string; k: 'brightness' | 'contrast' | 'saturate' }) => (
    <label className="field">
      <span>
        {label} ({Math.round(a[k] * 100)}%)
      </span>
      <input
        type="range"
        min={0}
        max={2}
        step={0.05}
        value={a[k]}
        onChange={(e) => setClipAdjust(clip.id, { [k]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <PanelSection>
      <div className="panel-subhead">
        Color <HelpLink topic="Color grading" />
        <button
          className="btn btn--mini"
          onClick={() => setClipAdjust(clip.id, { brightness: 1, contrast: 1, saturate: 1 })}
        >
          Reset
        </button>
      </div>
      <Slider label="Brightness" k="brightness" />
      <Slider label="Contrast" k="contrast" />
      <Slider label="Saturation" k="saturate" />
      <div className="field-row">
        <button className="btn btn--mini" onClick={() => setClipAdjust(clip.id, { saturate: 0 })}>
          B&amp;W
        </button>
        <button
          className="btn btn--mini"
          onClick={() => setClipAdjust(clip.id, { saturate: 1.4, contrast: 1.15, brightness: 1.05 })}
        >
          Vivid
        </button>
      </div>
    </PanelSection>
  );
}

function SettingsPanel() {
  const project = useEditor((s) => s.project);
  const setFps = useEditor((s) => s.setFps);
  const setBackground = useEditor((s) => s.setBackground);
  const setCanvasSize = useEditor((s) => s.setCanvasSize);
  const renameProject = useEditor((s) => s.renameProject);
  const value = `${project.width}x${project.height}`;
  return (
    <PanelSection>
      <label className="field">
        <span>Project name</span>
        <input value={project.name} onChange={(e) => renameProject(e.target.value)} spellCheck={false} />
      </label>
      <label className="field" data-tip="Frames per second of the output video.">
        <span>Frame rate</span>
        <select value={project.fps} onChange={(e) => setFps(Number(e.target.value))}>
          {[24, 25, 30, 50, 60].map((f) => (
            <option key={f} value={f}>
              {f} fps
            </option>
          ))}
        </select>
      </label>
      <div className="panel-subhead">
        Aspect ratio <HelpLink topic="Canvas size" />
      </div>
      <div className="aspect-list">
        {CANVAS_PRESETS.map((p) => (
          <button
            key={p.label}
            className={`aspect-item${value === `${p.w}x${p.h}` ? ' is-active' : ''}`}
            onClick={() => setCanvasSize(p.w, p.h)}
          >
            <span>{p.label}</span>
            <span className="aspect-item__dim">
              {p.w}×{p.h}
            </span>
          </button>
        ))}
      </div>
      <label className="field" data-tip="The fill shown behind/around clips (the letterbox color).">
        <span>Background</span>
        <input
          type="color"
          value={project.background ?? '#000000'}
          onChange={(e) => setBackground(e.target.value)}
        />
      </label>
    </PanelSection>
  );
}
