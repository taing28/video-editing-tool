/**
 * ui/Preview — the live preview canvas.
 *
 * Two layers:
 *  - a non-interactive BASE layer that renders the scene (everything except the
 *    currently selected element), scaled to fit; and
 *  - an INTERACTION layer (screen-space, unscaled) that renders the selected
 *    image/video/text as a draggable node with a Konva Transformer, so you can
 *    move/resize it directly. Edits are written back to the model on
 *    drag/transform end, so preview and export stay in sync.
 *
 * Video clips: the underlying <video> elements are driven to the playhead and
 * the layer is redrawn continuously while playing so frames refresh.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import {
  Stage,
  Layer,
  Group,
  Rect,
  Image as KonvaImage,
  Text as KonvaText,
  Transformer,
} from 'react-konva';
import { useEditor } from '../store/editorStore';
import {
  buildScene,
  weightToFontStyle,
  type Scene,
  type SceneLayer,
  type ImageLayer,
  type TextLayer,
  type ShapeLayer,
} from '../render/scene';
import { resolveMedia, getVideoElement } from '../media/registry';
import { getFilteredCanvas } from '../render/colorFilter';
import { getActiveVideoClips, sourceFrameAt } from '../core/selectors';
import type { ClipId, EffectId } from '../core/ids';

/**
 * Resolve the drawable for an image layer, applying color grading via the
 * SAME function the export uses — so the preview matches the file. Video layers
 * are `dynamic` (re-graded each frame); see `regradeDynamic`.
 */
function drawableFor(layer: ImageLayer): CanvasImageSource {
  return layer.adjust
    ? getFilteredCanvas(
        layer.clipId,
        layer.drawable,
        layer.width,
        layer.height,
        layer.adjust,
        layer.dynamic,
      )
    : layer.drawable;
}

/**
 * Repaint the graded canvas for every dynamic (video) layer from its CURRENT
 * frame. Called right before a Konva redraw so a graded <video> shows the
 * filtered live frame, not a stale snapshot. Returns how many layers it graded.
 */
function regradeDynamic(scene: { layers: SceneLayer[] }): number {
  let n = 0;
  for (const layer of scene.layers) {
    if (layer.kind === 'image' && layer.adjust && layer.dynamic) {
      getFilteredCanvas(layer.clipId, layer.drawable, layer.width, layer.height, layer.adjust, true);
      n++;
    }
  }
  return n;
}

export function Preview() {
  const project = useEditor((s) => s.project);
  const playhead = useEditor((s) => s.playhead);
  const isPlaying = useEditor((s) => s.isPlaying);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const selectedEffectId = useEditor((s) => s.selectedEffectId);
  const setClipTransform = useEditor((s) => s.setClipTransform);
  const updateText = useEditor((s) => s.updateTextEffect);
  const updateShape = useEditor((s) => s.updateShape);

  const boxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const imageRef = useRef<Konva.Image>(null);
  const textRef = useRef<Konva.Text>(null);
  const shapeRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setBox({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Keep <video> elements in step with the playhead.
  useEffect(() => {
    const activeIds = new Set<string>();
    for (const { clip } of getActiveVideoClips(project, playhead)) {
      if (clip.kind !== 'video') continue;
      const el = getVideoElement(clip.mediaId);
      if (!el) continue;
      activeIds.add(clip.mediaId);
      el.muted = true;
      el.playbackRate = clip.speed;
      const target = sourceFrameAt(clip, playhead) / project.fps;
      if (isPlaying) {
        if (el.paused) {
          try {
            el.currentTime = target;
          } catch {
            /* ignore */
          }
          void el.play().catch(() => {});
        }
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - target) > 0.02) {
          const onSeeked = () => {
            el.removeEventListener('seeked', onSeeked);
            if (sceneRef.current) regradeDynamic(sceneRef.current); // re-grade the new frame
            stageRef.current?.batchDraw(); // redraw all layers (clip may be selected)
          };
          el.addEventListener('seeked', onSeeked);
          try {
            el.currentTime = target;
          } catch {
            el.removeEventListener('seeked', onSeeked);
          }
        }
      }
    }
    for (const media of Object.values(project.media)) {
      if (media.kind === 'video' && !activeIds.has(media.id)) {
        const el = getVideoElement(media.id);
        if (el && !el.paused) el.pause();
      }
    }
  }, [project, playhead, isPlaying]);

  // While playing, redraw the base layer every frame so video pixels refresh.
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const loop = () => {
      if (sceneRef.current) regradeDynamic(sceneRef.current); // re-grade live video frames
      stageRef.current?.batchDraw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  const scene = useMemo(
    () => buildScene(project, playhead, resolveMedia, selectedClipId ?? undefined),
    [project, playhead, selectedClipId],
  );
  // Latest scene for the redraw loops (which mustn't re-subscribe per frame).
  const sceneRef = useRef<Scene | null>(null);
  sceneRef.current = scene;

  // A dynamic (video) graded layer reuses a stable canvas object, so changing
  // the grade or playhead while paused doesn't signal Konva to repaint — force
  // a regrade + redraw whenever the scene changes and dynamic layers exist.
  useLayoutEffect(() => {
    if (regradeDynamic(scene) > 0) stageRef.current?.batchDraw();
  }, [scene]);

  const scale =
    box.width > 0 && box.height > 0
      ? Math.min(box.width / scene.width, box.height / scene.height)
      : 0;
  const stageW = Math.max(1, Math.floor(scene.width * scale));
  const stageH = Math.max(1, Math.floor(scene.height * scale));

  // The selected element, if it's visible at the current frame.
  const selImage = scene.layers.find(
    (l): l is ImageLayer => l.kind === 'image' && l.clipId === selectedClipId,
  );
  const selText = scene.layers.find(
    (l): l is TextLayer => l.kind === 'text' && l.effectId === selectedEffectId,
  );
  const selShape = scene.layers.find(
    (l): l is ShapeLayer => l.kind === 'shape' && l.effectId === selectedEffectId,
  );
  // Base (un-faded) opacity of the selected shape, read from the document so the
  // node stays at full editing weight even when scrubbed into its fade.
  const selShapeEffect = selShape ? project.effects[selShape.effectId] : undefined;
  const selShapeBaseOpacity =
    selShapeEffect && selShapeEffect.type === 'shape' ? selShapeEffect.opacity : selShape?.opacity;

  // Attach the transformer to whichever node is selected.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selImage
      ? imageRef.current
      : selText
        ? textRef.current
        : selShape
          ? shapeRef.current
          : null;
    tr.nodes(node ? [node] : []);
    tr.forceUpdate();
    tr.getLayer()?.batchDraw();
  }, [selImage, selText, selShape, scale]);

  return (
    <div className="preview" ref={boxRef}>
      {scale > 0 && (
        <Stage ref={stageRef} width={stageW} height={stageH} className="preview__stage">
          {/* base scene (everything except the selected element) */}
          <Layer ref={layerRef} scaleX={scale} scaleY={scale} listening={false}>
            <Rect x={0} y={0} width={scene.width} height={scene.height} fill={scene.background} />
            {scene.layers.map((layer) => {
              if (layer === selImage || layer === selText || layer === selShape) return null;
              if (layer.kind === 'shape') {
                return (
                  <Rect
                    key={layer.effectId}
                    x={layer.x}
                    y={layer.y}
                    width={layer.width}
                    height={layer.height}
                    fill={layer.color}
                    opacity={layer.opacity}
                  />
                );
              }
              if (layer.kind === 'image') {
                const t = layer.transition;
                const slideDx = t?.type === 'slide' ? (1 - t.progress) * layer.width : 0;
                return (
                  <Group
                    key={layer.clipId}
                    clipX={t?.type === 'wipe' ? layer.x : undefined}
                    clipY={t?.type === 'wipe' ? layer.y : undefined}
                    clipWidth={t?.type === 'wipe' ? layer.width * t.progress : undefined}
                    clipHeight={t?.type === 'wipe' ? layer.height : undefined}
                  >
                    <KonvaImage
                      image={drawableFor(layer) as CanvasImageSource as HTMLImageElement}
                      x={layer.x + slideDx}
                      y={layer.y}
                      width={layer.width}
                      height={layer.height}
                      opacity={layer.opacity}
                    />
                  </Group>
                );
              }
              if (layer.kind === 'text') {
                return (
                  <KonvaText
                    key={layer.effectId}
                    text={layer.text}
                    x={layer.x}
                    y={layer.y}
                    fontSize={layer.fontSize}
                    fontFamily={layer.fontFamily}
                    fontStyle={weightToFontStyle(layer.fontWeight)}
                    fill={layer.color}
                    opacity={layer.opacity}
                  />
                );
              }
              // caption — centered, bottom-anchored, outlined
              return (
                <KonvaText
                  key={layer.effectId}
                  text={layer.lines.join('\n')}
                  x={0}
                  width={scene.width}
                  align="center"
                  lineHeight={1.2}
                  y={scene.height - layer.lines.length * layer.fontSize * 1.2 - layer.fontSize}
                  fontSize={layer.fontSize}
                  fontFamily={layer.fontFamily}
                  fontStyle="700"
                  fill={layer.color}
                  stroke="rgba(0,0,0,0.85)"
                  strokeWidth={Math.max(2, layer.fontSize * 0.12)}
                  fillAfterStrokeEnabled
                  opacity={layer.opacity}
                />
              );
            })}
          </Layer>

          {/* interaction layer (screen-space) for the selected element */}
          {(selImage || selText || selShape) && (
            <Layer>
              {selImage && (
                <KonvaImage
                  ref={imageRef}
                  image={drawableFor(selImage) as CanvasImageSource as HTMLImageElement}
                  x={selImage.x * scale}
                  y={selImage.y * scale}
                  width={selImage.width * scale}
                  height={selImage.height * scale}
                  opacity={selImage.opacity}
                  draggable
                  onDragEnd={(e) => {
                    const n = e.target;
                    setClipTransform(selectedClipId as ClipId, {
                      x: n.x() / scale,
                      y: n.y() / scale,
                      width: selImage.width,
                      height: selImage.height,
                      opacity: selImage.opacity,
                    });
                  }}
                  onTransformEnd={(e) => {
                    const n = e.target;
                    const w = Math.max(8, n.width() * n.scaleX());
                    const h = Math.max(8, n.height() * n.scaleY());
                    n.scaleX(1);
                    n.scaleY(1);
                    setClipTransform(selectedClipId as ClipId, {
                      x: n.x() / scale,
                      y: n.y() / scale,
                      width: w / scale,
                      height: h / scale,
                      opacity: selImage.opacity,
                    });
                  }}
                />
              )}
              {selText && (
                <KonvaText
                  ref={textRef}
                  text={selText.text}
                  x={selText.x * scale}
                  y={selText.y * scale}
                  fontSize={selText.fontSize * scale}
                  fontFamily={selText.fontFamily}
                  fontStyle={weightToFontStyle(selText.fontWeight)}
                  fill={selText.color}
                  draggable
                  onDragEnd={(e) => {
                    const n = e.target;
                    updateText(selectedEffectId as EffectId, {
                      x: Math.round(n.x() / scale),
                      y: Math.round(n.y() / scale),
                    });
                  }}
                  onTransformEnd={(e) => {
                    const n = e.target;
                    const size = Math.max(6, Math.round(selText.fontSize * n.scaleX()));
                    n.scaleX(1);
                    n.scaleY(1);
                    updateText(selectedEffectId as EffectId, {
                      x: Math.round(n.x() / scale),
                      y: Math.round(n.y() / scale),
                      fontSize: size,
                    });
                  }}
                />
              )}
              {selShape && (
                <Rect
                  ref={shapeRef}
                  x={selShape.x * scale}
                  y={selShape.y * scale}
                  width={selShape.width * scale}
                  height={selShape.height * scale}
                  fill={selShape.color}
                  // Edit at the shape's base opacity (ignore the fade envelope),
                  // mirroring how a selected clip ignores its transition.
                  opacity={selShapeBaseOpacity}
                  draggable
                  onDragEnd={(e) => {
                    const n = e.target;
                    updateShape(selectedEffectId as EffectId, {
                      x: Math.round(n.x() / scale),
                      y: Math.round(n.y() / scale),
                    });
                  }}
                  onTransformEnd={(e) => {
                    const n = e.target;
                    const w = Math.max(8, n.width() * n.scaleX());
                    const h = Math.max(8, n.height() * n.scaleY());
                    n.scaleX(1);
                    n.scaleY(1);
                    updateShape(selectedEffectId as EffectId, {
                      x: Math.round(n.x() / scale),
                      y: Math.round(n.y() / scale),
                      width: Math.round(w / scale),
                      height: Math.round(h / scale),
                    });
                  }}
                />
              )}
              <Transformer
                ref={trRef}
                rotateEnabled={false}
                keepRatio={Boolean(selText)}
                boundBoxFunc={(oldBox, newBox) =>
                  newBox.width < 12 || newBox.height < 12 ? oldBox : newBox
                }
              />
            </Layer>
          )}
        </Stage>
      )}
      <div className="preview__badge">
        {project.width}×{project.height} · {project.fps}fps
      </div>
    </div>
  );
}
