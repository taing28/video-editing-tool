/**
 * ui/Timeline — multi-track timeline.
 *
 * - Row 1 is the video/image track; rows below are audio.
 * - Clips render as absolutely-positioned blocks (left = startFrame * pxPerFrame).
 * - Dragging a clip body moves it; dragging an edge handle trims it. A whole
 *   gesture is ONE undo step (we snapshot once on first movement, then apply
 *   each frame from that captured baseline).
 * - The ruler scrubs the playhead. Lanes are dnd-kit drop targets for the
 *   media library.
 */
import { memo, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useEditor } from '../store/editorStore';
import type { Project, Clip, Effect } from '../core/model';
import type { TrackId } from '../core/ids';
import { getTrackClips, timelineRows, partitionPinned } from '../core/selectors';
import type { TimelineRow } from '../core/selectors';
import { snapStart, snapTargets } from '../core/snapping';
import { secondsToFrames } from '../core/time';
import { Waveform } from './Waveform';
import { ClipFilmstrip } from './ClipFilmstrip';
import { ScrollArea } from './ScrollArea';

/** Width of the sticky track-label gutter; clips/ruler/playhead align after it. */
const LABEL_WIDTH = 92;

/**
 * Hand-rolled vertical reorder drag, mirroring the clip/overlay drag pattern.
 * The grip's onPointerDown starts it; while dragging, the `.lane` under the
 * pointer (matched by data-row-id / data-row-group in the same group) becomes
 * the drop target. One gesture = one undo step.
 */
function useRowReorder(row: TimelineRow) {
  const applyRowReorder = useEditor((s) => s.applyRowReorder);
  const beginInteraction = useEditor((s) => s.beginInteraction);
  const dragging = useRef(false);
  const started = useRef(false);

  const onGripDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragging.current = true;
    started.current = false;
  };

  const onGripMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const el = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((n) => (n as HTMLElement).classList?.contains('lane')) as HTMLElement | undefined;
    const targetId = el?.dataset.rowId;
    const targetGroup = el?.dataset.rowGroup;
    if (!targetId || targetId === row.id) return;
    const myGroup = row.type === 'overlay' ? 'overlay' : row.kind;
    if (targetGroup !== myGroup) return; // same group only
    if (!started.current) {
      started.current = true;
      beginInteraction();
    }
    const r = el!.getBoundingClientRect();
    const place = e.clientY < r.top + r.height / 2 ? 'above' : 'below';
    // TRANSIENT apply — beginInteraction() above took the one history snapshot
    // for this gesture, so pointer-moves must not commit (a drag across N rows
    // would otherwise flood the undo stack with an entry per crossing).
    applyRowReorder(row, targetId, place);
  };

  const onGripUp = (e: React.PointerEvent) => {
    if (dragging.current) (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragging.current = false;
  };

  return { onGripDown, onGripMove, onGripUp };
}

interface DragState {
  mode: 'move' | 'trim-start' | 'trim-end';
  startX: number;
  origStart: number;
  origEnd: number;
  baseline: Project;
  /** Snap targets captured at drag start (other clips' edges, playhead, 0). */
  targets: number[];
  started: boolean;
}

const ClipBlock = memo(function ClipBlock({ clip, pxPerFrame }: { clip: Clip; pxPerFrame: number }) {
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const fps = useEditor((s) => s.project.fps);
  const media = useEditor((s) => s.project.media[clip.mediaId]);
  const selectClip = useEditor((s) => s.selectClip);
  const beginInteraction = useEditor((s) => s.beginInteraction);
  const applyMove = useEditor((s) => s.applyMove);
  const applyTrimStart = useEditor((s) => s.applyTrimStart);
  const applyTrimEnd = useEditor((s) => s.applyTrimEnd);

  const drag = useRef<DragState | null>(null);
  const selected = selectedClipId === clip.id;

  const startDrag = (mode: DragState['mode']) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    selectClip(clip.id);
    const state = useEditor.getState();
    drag.current = {
      mode,
      startX: e.clientX,
      origStart: clip.startFrame,
      origEnd: clip.startFrame + clip.durationInFrames,
      baseline: state.project,
      targets: snapTargets(state.project, clip.id, state.playhead),
      started: false,
    };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.started) {
      if (Math.abs(e.clientX - d.startX) < 3) return;
      d.started = true;
      beginInteraction(); // snapshot once, at the start of the real gesture
    }
    const deltaFrames = Math.round((e.clientX - d.startX) / pxPerFrame);
    if (d.mode === 'move') {
      const desired = d.origStart + deltaFrames;
      const start = useEditor.getState().snappingEnabled
        ? snapStart(desired, clip.durationInFrames, d.targets, 8 / pxPerFrame)
        : desired;
      applyMove(d.baseline, clip.id, start);
    } else if (d.mode === 'trim-start') {
      applyTrimStart(d.baseline, clip.id, d.origStart + deltaFrames);
    } else {
      applyTrimEnd(d.baseline, clip.id, d.origEnd + deltaFrames);
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    if (drag.current) (e.target as Element).releasePointerCapture?.(e.pointerId);
    drag.current = null;
  };

  return (
    <div
      className={`clip clip--${clip.kind}${selected ? ' is-selected' : ''}`}
      style={{ left: clip.startFrame * pxPerFrame, width: clip.durationInFrames * pxPerFrame }}
      onPointerDown={startDrag('move')}
      onPointerMove={onMove}
      onPointerUp={endDrag}
    >
      {clip.kind === 'audio' ? (
        <Waveform clip={clip} pxPerFrame={pxPerFrame} fps={fps} />
      ) : (
        media && (
          <ClipFilmstrip
            media={media}
            widthPx={clip.durationInFrames * pxPerFrame}
            sourceInFrame={clip.sourceInFrame}
            durationInFrames={clip.durationInFrames}
            sourceDurationFrames={media.durationInFrames}
          />
        )
      )}
      <span
        className="clip__handle clip__handle--l"
        data-tip="Drag to trim the start. Drag back out to restore — trimming never deletes the source."
        onPointerDown={startDrag('trim-start')}
      />
      <span className="clip__label">{labelFor(clip, media?.name)}</span>
      <span
        className="clip__handle clip__handle--r"
        data-tip="Drag to trim the end. Drag back out to restore — trimming never deletes the source."
        onPointerDown={startDrag('trim-end')}
      />
    </div>
  );
});

function labelFor(clip: Clip, name?: string): string {
  return name ?? clip.kind;
}

// --- overlay lanes (one row per timed overlay) -----------------------------

function overlayIcon(e: Effect): string {
  if (e.type === 'caption') return 'CC';
  if (e.type === 'shape') return '▭';
  if (e.type === 'image') return '🖼';
  return 'T';
}

function overlayLabel(e: Effect, mediaName?: string): string {
  if (e.type === 'caption') return e.text || 'Caption';
  if (e.type === 'shape') return 'Shape';
  if (e.type === 'image') return mediaName ?? 'Image';
  return e.text || 'Text';
}

interface OverlayDragState {
  mode: 'move' | 'trim-start' | 'trim-end';
  startX: number;
  origStart: number;
  origEnd: number;
  baseline: Project;
  started: boolean;
}

/** A draggable/trimmable block for one overlay, reusing the clip block chrome. */
const OverlayBlock = memo(function OverlayBlock({
  effect,
  pxPerFrame,
}: {
  effect: Effect;
  pxPerFrame: number;
}) {
  const selectedEffectId = useEditor((s) => s.selectedEffectId);
  const selectEffect = useEditor((s) => s.selectEffect);
  const beginInteraction = useEditor((s) => s.beginInteraction);
  const applyEffectMove = useEditor((s) => s.applyEffectMove);
  const applyEffectTrimStart = useEditor((s) => s.applyEffectTrimStart);
  const applyEffectTrimEnd = useEditor((s) => s.applyEffectTrimEnd);
  const media = useEditor((s) =>
    effect.type === 'image' ? s.project.media[effect.mediaId] : undefined,
  );

  const drag = useRef<OverlayDragState | null>(null);
  const selected = selectedEffectId === effect.id;

  const startDrag = (mode: OverlayDragState['mode']) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    selectEffect(effect.id);
    const state = useEditor.getState();
    drag.current = {
      mode,
      startX: e.clientX,
      origStart: effect.timing.start,
      origEnd: effect.timing.start + effect.timing.duration,
      baseline: state.project,
      started: false,
    };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.started) {
      if (Math.abs(e.clientX - d.startX) < 3) return;
      d.started = true;
      beginInteraction();
    }
    const deltaFrames = Math.round((e.clientX - d.startX) / pxPerFrame);
    if (d.mode === 'move') applyEffectMove(d.baseline, effect.id, d.origStart + deltaFrames);
    else if (d.mode === 'trim-start')
      applyEffectTrimStart(d.baseline, effect.id, d.origStart + deltaFrames);
    else applyEffectTrimEnd(d.baseline, effect.id, d.origEnd + deltaFrames);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (drag.current) (e.target as Element).releasePointerCapture?.(e.pointerId);
    drag.current = null;
  };

  return (
    <div
      className={`clip clip--overlay clip--ov-${effect.type}${selected ? ' is-selected' : ''}`}
      style={{
        left: effect.timing.start * pxPerFrame,
        width: effect.timing.duration * pxPerFrame,
      }}
      onPointerDown={startDrag('move')}
      onPointerMove={onMove}
      onPointerUp={endDrag}
    >
      <span
        className="clip__handle clip__handle--l"
        data-tip="Drag to change when this overlay starts."
        onPointerDown={startDrag('trim-start')}
      />
      <span className="clip__label">{overlayLabel(effect, media?.name)}</span>
      <span
        className="clip__handle clip__handle--r"
        data-tip="Drag to change when this overlay ends."
        onPointerDown={startDrag('trim-end')}
      />
    </div>
  );
});

function OverlayLane({ effect, pxPerFrame }: { effect: Effect; pxPerFrame: number }) {
  const removeEffect = useEditor((s) => s.removeEffect);
  const selectEffect = useEditor((s) => s.selectEffect);
  const toggleRowPinned = useEditor((s) => s.toggleRowPinned);
  const selected = useEditor((s) => s.selectedEffectId === effect.id);
  const media = useEditor((s) =>
    effect.type === 'image' ? s.project.media[effect.mediaId] : undefined,
  );
  const grip = useRowReorder({ type: 'overlay', id: effect.id, pinned: !!effect.pinned });

  return (
    <div
      className={`lane lane--overlay${selected ? ' is-active' : ''}`}
      data-row-id={effect.id}
      data-row-group="overlay"
    >
      <div className="lane__label">
        <span
          className="lane__grip"
          title="Drag to reorder"
          onPointerDown={grip.onGripDown}
          onPointerMove={grip.onGripMove}
          onPointerUp={grip.onGripUp}
        >
          ⋮⋮
        </span>
        <span className="lane__name" title={overlayLabel(effect, media?.name)}>
          <span className="lane__ico">{overlayIcon(effect)}</span>
          {overlayLabel(effect, media?.name)}
        </span>
        <div className="lane__controls">
          <button
            className={`lane__toggle${effect.pinned ? ' is-on' : ''}`}
            title={effect.pinned ? 'Unpin row' : 'Pin row to top'}
            aria-label={effect.pinned ? 'Unpin row' : 'Pin row to top'}
            aria-pressed={!!effect.pinned}
            onClick={() => toggleRowPinned({ type: 'overlay', id: effect.id, pinned: !!effect.pinned })}
          >
            📌
          </button>
          <button
            className="lane__delete"
            title="Delete overlay"
            aria-label="Delete overlay"
            onClick={() => removeEffect(effect.id)}
          >
            ✕
          </button>
        </div>
      </div>
      <div
        className="lane__area"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).classList.contains('lane__area')) selectEffect(null);
        }}
      >
        <OverlayBlock effect={effect} pxPerFrame={pxPerFrame} />
      </div>
    </div>
  );
}

function TrackLane({ trackId, pxPerFrame }: { trackId: string; pxPerFrame: number }) {
  const project = useEditor((s) => s.project);
  const removeTrack = useEditor((s) => s.removeTrack);
  const toggleMuted = useEditor((s) => s.toggleTrackMuted);
  const toggleHidden = useEditor((s) => s.toggleTrackHidden);
  const toggleRowPinned = useEditor((s) => s.toggleRowPinned);
  const { setNodeRef, isOver } = useDroppable({ id: `track:${trackId}` });
  const track = project.tracks[trackId];
  const grip = useRowReorder({
    type: 'track',
    id: trackId as TrackId,
    kind: track?.kind ?? 'video',
    pinned: !!track?.pinned,
  });
  if (!track) return null;
  const clips = getTrackClips(project, track.id);

  return (
    <div
      className={`lane lane--${track.kind}${track.hidden ? ' is-hidden' : ''}`}
      data-row-id={track.id}
      data-row-group={track.kind}
    >
      <div className="lane__label">
        <span
          className="lane__grip"
          title="Drag to reorder"
          onPointerDown={grip.onGripDown}
          onPointerMove={grip.onGripMove}
          onPointerUp={grip.onGripUp}
        >
          ⋮⋮
        </span>
        <span className="lane__name">{track.name}</span>
        <div className="lane__controls">
          <button
            className={`lane__toggle${track.pinned ? ' is-on' : ''}`}
            title={track.pinned ? 'Unpin row' : 'Pin row to top'}
            aria-label={track.pinned ? 'Unpin row' : 'Pin row to top'}
            aria-pressed={!!track.pinned}
            onClick={() =>
              toggleRowPinned({ type: 'track', id: track.id, kind: track.kind, pinned: !!track.pinned })
            }
          >
            📌
          </button>
          {track.kind === 'audio' ? (
            <button
              className={`lane__toggle${track.muted ? ' is-off' : ''}`}
              title={track.muted ? 'Unmute track' : 'Mute track'}
              aria-label={track.muted ? 'Unmute track' : 'Mute track'}
              aria-pressed={track.muted}
              onClick={() => toggleMuted(track.id)}
            >
              {track.muted ? '🔇' : '🔊'}
            </button>
          ) : (
            <button
              className={`lane__toggle${track.hidden ? ' is-off' : ''}`}
              title={track.hidden ? 'Show track' : 'Hide track'}
              aria-label={track.hidden ? 'Show track' : 'Hide track'}
              aria-pressed={track.hidden}
              onClick={() => toggleHidden(track.id)}
            >
              {track.hidden ? '🚫' : '👁'}
            </button>
          )}
          <button
            className="lane__delete"
            title="Delete track"
            aria-label="Delete track"
            onClick={() => removeTrack(track.id)}
          >
            ✕
          </button>
        </div>
      </div>
      <div ref={setNodeRef} className={`lane__area${isOver ? ' is-over' : ''}`}>
        {clips.map((clip) => (
          <ClipBlock key={clip.id} clip={clip} pxPerFrame={pxPerFrame} />
        ))}
      </div>
    </div>
  );
}

function Ruler({
  pxPerFrame,
  fps,
  durationFrames,
  onScrub,
}: {
  pxPerFrame: number;
  fps: number;
  durationFrames: number;
  onScrub: (clientX: number) => void;
}) {
  const scrubbing = useRef(false);
  const pxPerSecond = pxPerFrame * fps;
  const stepSeconds = pxPerSecond < 50 ? 5 : 1;
  const totalSeconds = Math.ceil(durationFrames / fps) + 2;
  const ticks: number[] = [];
  for (let s = 0; s <= totalSeconds; s += stepSeconds) ticks.push(s);

  return (
    <div
      className="ruler"
      onPointerDown={(e) => {
        scrubbing.current = true;
        (e.target as Element).setPointerCapture(e.pointerId);
        onScrub(e.clientX);
      }}
      onPointerMove={(e) => scrubbing.current && onScrub(e.clientX)}
      onPointerUp={(e) => {
        scrubbing.current = false;
        (e.target as Element).releasePointerCapture?.(e.pointerId);
      }}
    >
      {ticks.map((s) => (
        <div
          key={s}
          className="ruler__tick"
          style={{ left: LABEL_WIDTH + secondsToFrames(s, fps) * pxPerFrame }}
        >
          <span>{s}s</span>
        </div>
      ))}
    </div>
  );
}

/** Render one timeline row as its lane (overlay or track). */
function LaneRow({ row, pxPerFrame }: { row: TimelineRow; pxPerFrame: number }) {
  const effect = useEditor((s) => (row.type === 'overlay' ? s.project.effects[row.id] : undefined));
  if (row.type === 'overlay') {
    if (!effect) return null;
    return <OverlayLane effect={effect} pxPerFrame={pxPerFrame} />;
  }
  return <TrackLane trackId={row.id} pxPerFrame={pxPerFrame} />;
}

export function Timeline() {
  const project = useEditor((s) => s.project);
  const playhead = useEditor((s) => s.playhead);
  const pxPerFrame = useEditor((s) => s.pxPerFrame);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const selectClip = useEditor((s) => s.selectClip);

  const contentRef = useRef<HTMLDivElement>(null);
  // Ordered rows (overlays on top, then tracks), partitioned into a sticky
  // pinned band + the scrolling remainder.
  const rows = timelineRows(project);
  const { pinned, scrolling } = partitionPinned(rows);

  // Reach the furthest overlay too, so a block dragged past the last clip stays
  // scrollable into view (overlays don't extend the document duration).
  const lastOverlayEnd = Object.values(project.effects).reduce(
    (m, e) => Math.max(m, e.timing.start + e.timing.duration),
    0,
  );
  const minFrames = Math.max(
    project.durationInFrames,
    lastOverlayEnd,
    secondsToFrames(20, project.fps),
  );
  const contentWidth = LABEL_WIDTH + minFrames * pxPerFrame + 240;

  const scrubToClientX = (clientX: number) => {
    const el = contentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left - LABEL_WIDTH; // align with the clip area
    setPlayhead(Math.max(0, x / pxPerFrame));
  };

  return (
    <section className="timeline">
      <ScrollArea className="timeline__scroll" orientation="both">
        <div
          className="timeline__content"
          ref={contentRef}
          style={{ width: contentWidth }}
          onPointerDown={(e) => {
            // Clicking empty lane space clears selection.
            if ((e.target as HTMLElement).classList.contains('lane__area')) selectClip(null);
          }}
        >
          <Ruler
            pxPerFrame={pxPerFrame}
            fps={project.fps}
            durationFrames={minFrames}
            onScrub={scrubToClientX}
          />
          {pinned.length > 0 && (
            <div className="timeline__pinned">
              {pinned.map((row) => (
                <LaneRow key={row.id} row={row} pxPerFrame={pxPerFrame} />
              ))}
            </div>
          )}
          {scrolling.map((row) => (
            <LaneRow key={row.id} row={row} pxPerFrame={pxPerFrame} />
          ))}
          <div className="playhead" style={{ left: LABEL_WIDTH + playhead * pxPerFrame }} />
        </div>
      </ScrollArea>
    </section>
  );
}
