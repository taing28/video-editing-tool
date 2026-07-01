/**
 * render/captionLayout — shared word layout for karaoke captions.
 *
 * Both the preview (Konva) and the export (Canvas2D) call this to place each
 * word, so the wrapped lines + per-word x positions are IDENTICAL in both — the
 * same parity trick as the color-grade filtered canvas. Measurement uses one
 * cached offscreen 2D context with the same font string both renderers draw with.
 */
export interface LaidWord {
  text: string;
  /** Index into the caption's flat word list (for highlight matching). */
  index: number;
  /** X offset from the line's left edge (project px). */
  x: number;
  width: number;
}

export interface CaptionLine {
  words: LaidWord[];
  /** Total line width (project px) — the renderer centers by this. */
  width: number;
}

/** The font string both renderers use for captions. Keep in ONE place for parity. */
export function captionFont(fontSize: number, fontFamily: string): string {
  return `700 ${fontSize}px ${fontFamily}`;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  try {
    measureCtx = document.createElement('canvas').getContext('2d');
  } catch {
    measureCtx = null;
  }
  return measureCtx;
}

/** Greedy word-wrap `words` to `maxWidth`, returning per-line positioned words. */
export function layoutCaption(
  words: string[],
  fontSize: number,
  fontFamily: string,
  maxWidth: number,
): CaptionLine[] {
  const ctx = getMeasureCtx();
  const font = captionFont(fontSize, fontFamily);
  if (ctx) ctx.font = font;
  const measure = (t: string) => (ctx ? ctx.measureText(t).width : t.length * fontSize * 0.55);
  const spaceW = ctx ? ctx.measureText(' ').width : fontSize * 0.3;

  const lines: CaptionLine[] = [];
  let cur: LaidWord[] = [];
  let x = 0;
  words.forEach((text, index) => {
    const w = measure(text);
    if (cur.length > 0 && x + spaceW + w > maxWidth) {
      lines.push({ words: cur, width: x });
      cur = [];
      x = 0;
    }
    if (cur.length > 0) x += spaceW;
    cur.push({ text, index, x, width: w });
    x += w;
  });
  if (cur.length > 0) lines.push({ words: cur, width: x });
  return lines;
}
