/**
 * ui/MediaLibrary — the left sidebar.
 *
 * Imported assets appear here as cards. Each card is a dnd-kit draggable
 * (drag onto a timeline track to add it) and also supports click-to-add as a
 * keyboard/'no-drag' fallback.
 */
import { useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useEditor } from '../store/editorStore';
import type { MediaAsset } from '../core/model';
import { getTracksInOrder } from '../core/selectors';
import { framesToSeconds, secondsToFrames } from '../core/time';
import { mediaFitsTrack } from '../core/edits';

function MediaCard({ asset }: { asset: MediaAsset }) {
  const project = useEditor((s) => s.project);
  const addClipFromMedia = useEditor((s) => s.addClipFromMedia);
  const removeMedia = useEditor((s) => s.removeMedia);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `media:${asset.id}`,
    data: { mediaId: asset.id },
  });

  const seconds = framesToSeconds(asset.durationInFrames, project.fps);

  const quickAdd = () => {
    const track = getTracksInOrder(project).find((t) => mediaFitsTrack(asset, t));
    if (track) addClipFromMedia(asset.id, track.id);
  };

  return (
    <div
      ref={setNodeRef}
      className={`media-card media-card--${asset.kind}${isDragging ? ' is-dragging' : ''}`}
      {...attributes}
      {...listeners}
      onDoubleClick={quickAdd}
      title="Drag onto a track, or double-click to add"
    >
      <div className="media-card__thumb">
        {asset.kind === 'image' ? (
          <img src={asset.src} alt={asset.name} />
        ) : (
          <span className="media-card__icon">{asset.kind === 'audio' ? '♪' : '▶'}</span>
        )}
      </div>
      <div className="media-card__meta">
        <span className="media-card__name">{asset.name}</span>
        <span className="media-card__sub">
          {asset.kind} · {seconds.toFixed(1)}s
        </span>
      </div>
      <button
        className="media-card__delete"
        title="Delete asset (and its clips)"
        aria-label={`Delete ${asset.name}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => removeMedia(asset.id)}
      >
        ✕
      </button>
    </div>
  );
}

export function MediaLibrary() {
  // Select the STABLE map reference; derive the array in render. Returning
  // `Object.values(...)` straight from the selector makes a new array every
  // render and sends useSyncExternalStore into an infinite loop.
  const mediaMap = useEditor((s) => s.project.media);
  const media = Object.values(mediaMap);
  const importMedia = useEditor((s) => s.importMedia);
  const buildSlideshow = useEditor((s) => s.buildSlideshow);
  const fps = useEditor((s) => s.project.fps);
  const inputRef = useRef<HTMLInputElement>(null);

  const imageCount = media.filter((m) => m.kind === 'image').length;
  const [secs, setSecs] = useState(4);
  const [kenBurns, setKenBurns] = useState(true);
  const [crossfade, setCrossfade] = useState(true);

  const onPick = (files: FileList | null) => {
    if (files && files.length) void importMedia(Array.from(files));
  };

  const makeSlideshow = () =>
    buildSlideshow({
      durationInFrames: secondsToFrames(Math.max(0.5, secs), fps),
      motion: kenBurns,
      crossfadeFrames: crossfade ? secondsToFrames(0.5, fps) : 0,
    });

  return (
    <aside
      className="library"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onPick(e.dataTransfer.files);
      }}
    >
      <div className="library__head">
        <span>{media.length > 0 ? `${media.length} item${media.length > 1 ? 's' : ''}` : ''}</span>
        <button className="btn btn--sm" onClick={() => inputRef.current?.click()}>
          Import
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,audio/*,video/*"
          multiple
          hidden
          onChange={(e) => {
            onPick(e.target.files);
            // Reset so picking the SAME file again (e.g. after deleting it)
            // still fires a change event.
            e.target.value = '';
          }}
        />
      </div>

      {imageCount >= 1 && (
        <div className="slideshow">
          <div className="slideshow__row">
            <button
              className="btn btn--sm slideshow__go"
              onClick={makeSlideshow}
              data-tip="Add all imported images to the video track as a timed sequence, in one step."
            >
              🎞 Make slideshow from {imageCount} image{imageCount > 1 ? 's' : ''}
            </button>
          </div>
          <div className="slideshow__opts">
            <label className="slideshow__opt">
              <span>Seconds per image</span>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={secs}
                onChange={(e) => setSecs(Number(e.target.value))}
              />
            </label>
            <label
              className="slideshow__opt slideshow__opt--check"
              data-tip="Slowly zooms/pans each photo so stills feel alive."
            >
              <input
                type="checkbox"
                checked={kenBurns}
                onChange={(e) => setKenBurns(e.target.checked)}
              />
              <span>Pan &amp; zoom (Ken Burns)</span>
            </label>
            <label
              className="slideshow__opt slideshow__opt--check"
              data-tip="Each image fades into the next (0.5s overlap)."
            >
              <input
                type="checkbox"
                checked={crossfade}
                onChange={(e) => setCrossfade(e.target.checked)}
              />
              <span>Crossfade</span>
            </label>
          </div>
        </div>
      )}

      <div className="library__list">
        {media.length === 0 ? (
          <p className="library__empty">
            Import images, audio, or video — or drop files here. Then drag them onto a track below.
          </p>
        ) : (
          media.map((asset) => <MediaCard key={asset.id} asset={asset} />)
        )}
      </div>
    </aside>
  );
}
