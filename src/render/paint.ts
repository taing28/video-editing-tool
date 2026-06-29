/**
 * render/paint — imperative Canvas2D painter for a Scene.
 *
 * This is the EXPORT side of the render seam. It draws the exact same `Scene`
 * that the Konva preview renders, but with plain immediate-mode Canvas2D (no
 * Konva), so it works in an OffscreenCanvas/Worker later and stays cheap per
 * frame. Preview and export agree because they both consume `buildScene`.
 */
import type { Scene } from './scene';

export function paintScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  scene: Scene,
): void {
  ctx.clearRect(0, 0, scene.width, scene.height);
  ctx.fillStyle = scene.background;
  ctx.fillRect(0, 0, scene.width, scene.height);

  for (const layer of scene.layers) {
    if (layer.kind === 'image') {
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(layer.drawable, layer.x, layer.y, layer.width, layer.height);
      ctx.globalAlpha = 1;
    } else if (layer.kind === 'text') {
      // Free-positioned, top-left anchored at (x, y) — mirrors the preview.
      ctx.fillStyle = layer.color;
      ctx.font = `${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const lineHeight = layer.fontSize * 1.2;
      layer.text.split('\n').forEach((line, i) => {
        ctx.fillText(line, layer.x, layer.y + i * lineHeight);
      });
    } else {
      // Caption: centered, bottom-anchored, outlined for readability.
      const lineHeight = layer.fontSize * 1.2;
      const margin = layer.fontSize;
      const y0 = scene.height - layer.lines.length * lineHeight - margin;
      const cx = scene.width / 2;
      ctx.font = `700 ${layer.fontSize}px ${layer.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = Math.max(2, layer.fontSize * 0.12);
      ctx.fillStyle = layer.color;
      layer.lines.forEach((line, i) => {
        const y = y0 + i * lineHeight;
        ctx.strokeText(line, cx, y);
        ctx.fillText(line, cx, y);
      });
    }
  }
}
