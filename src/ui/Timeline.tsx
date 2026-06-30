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
import type { Project, Clip } from '../core/model';
import { getTracksInOrder, getTrackClips } from '../core/selectors';
import { snapStart, snapTargets } from '../core/snapping';
import { secondsToFrames } from '../core/time';
import { Waveform } from './Waveform';
import { ClipFilmstrip } from './ClipFilmstrip';

/** Width of the sticky track-label gutter; clips/ruler/playhead align after it. */
const LABEL_WIDTH = 92;

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

function TrackLane({ trackId, pxPerFrame }: { trackId: string; pxPerFrame: number }) {
  const project = useEditor((s) => s.project);
  const removeTrack = useEditor((s) => s.removeTrack);
  const toggleMuted = useEditor((s) => s.toggleTrackMuted);
  const toggleHidden = useEditor((s) => s.toggleTrackHidden);
  const { setNodeRef, isOver } = useDroppable({ id: `track:${trackId}` });
  const track = project.tracks[trackId];
  if (!track) return null;
  const clips = getTrackClips(project, track.id);

  return (
    <div className={`lane lane--${track.kind}${track.hidden ? ' is-hidden' : ''}`}>
      <div className="lane__label">
        <span className="lane__name">{track.name}</span>
        <div className="lane__controls">
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

export function Timeline() {
  const project = useEditor((s) => s.project);
  const playhead = useEditor((s) => s.playhead);
  const pxPerFrame = useEditor((s) => s.pxPerFrame);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const selectClip = useEditor((s) => s.selectClip);

  const contentRef = useRef<HTMLDivElement>(null);
  const tracks = getTracksInOrder(project);

  const minFrames = Math.max(project.durationInFrames, secondsToFrames(20, project.fps));
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
      <div className="timeline__scroll">
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
          {tracks.map((track) => (
            <TrackLane key={track.id} trackId={track.id} pxPerFrame={pxPerFrame} />
          ))}
          <div className="playhead" style={{ left: LABEL_WIDTH + playhead * pxPerFrame }} />
        </div>
      </div>
    </section>
  );
}
