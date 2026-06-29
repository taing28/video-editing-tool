/**
 * ui/ClipFilmstrip — tiled thumbnail frames behind a timeline clip, so the clip
 * shows its content instead of just a name. Tiles map the clip's TRIM window
 * (sourceInFrame..+duration) onto the cached source frames, so trimming the clip
 * slides/shrinks the visible frames to match what actually plays.
 */
import { memo, useEffect, useState } from 'react';
import type { MediaAsset } from '../core/model';
import { getFilmstrip } from '../media/thumbnails';

const TILE_W = 72;

export const ClipFilmstrip = memo(function ClipFilmstrip({
  media,
  widthPx,
  sourceInFrame,
  durationInFrames,
  sourceDurationFrames,
}: {
  media: MediaAsset;
  widthPx: number;
  sourceInFrame: number;
  durationInFrames: number;
  sourceDurationFrames: number;
}) {
  const [frames, setFrames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getFilmstrip(media).then((f) => {
      if (!cancelled) setFrames(f);
    });
    return () => {
      cancelled = true;
    };
  }, [media]);

  if (frames.length === 0) return null;
  const tiles = Math.max(1, Math.ceil(widthPx / TILE_W));
  const srcDur = Math.max(1, sourceDurationFrames);

  return (
    <div className="filmstrip">
      {Array.from({ length: tiles }, (_, i) => {
        // Source position (frames) shown at this tile, mapped to a cached frame.
        const srcFrame = sourceInFrame + (i / tiles) * durationInFrames;
        const idx = Math.min(
          frames.length - 1,
          Math.max(0, Math.round((srcFrame / srcDur) * (frames.length - 1))),
        );
        return (
          <div
            key={i}
            className="filmstrip__tile"
            style={{ backgroundImage: `url(${frames[idx]})` }}
          />
        );
      })}
    </div>
  );
});
