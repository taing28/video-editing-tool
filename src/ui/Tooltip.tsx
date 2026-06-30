/**
 * ui/Tooltip — one global tooltip driven by `data-tip` attributes.
 *
 * Mount once. Any element with `data-tip="..."` shows a styled bubble ~1s after
 * the pointer rests on it. No per-element wiring needed.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const DELAY_MS = 1000;

export function Tooltip() {
  const [tip, setTip] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [pos, setPos] = useState({ left: 0, top: 0, below: true });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: Element | null = null;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    const hide = () => {
      clear();
      active = null;
      setTip(null);
    };
    const onOver = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest('[data-tip]') ?? null;
      if (el === active) return; // same element (or a child of it) — keep waiting
      active = el;
      clear();
      setTip(null);
      if (!el) return;
      timer = setTimeout(() => {
        const text = el.getAttribute('data-tip');
        if (text) setTip({ text, rect: el.getBoundingClientRect() });
      }, DELAY_MS);
    };
    const onOut = (e: PointerEvent) => {
      if (!active) return;
      const to = e.relatedTarget as Node | null;
      if (to && active.contains(to)) return; // moved within the same element
      hide();
    };
    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerout', onOut, true);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('keydown', hide, true);
    window.addEventListener('wheel', hide, true);
    return () => {
      clear();
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerout', onOut, true);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('keydown', hide, true);
      window.removeEventListener('wheel', hide, true);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const { rect } = tip;
    const margin = 8;
    const below = rect.bottom + box.height + 10 < window.innerHeight;
    const top = below ? rect.bottom + 8 : rect.top - box.height - 8;
    const left = Math.max(
      margin,
      Math.min(rect.left + rect.width / 2 - box.width / 2, window.innerWidth - box.width - margin),
    );
    setPos({ left, top, below });
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={ref}
      className={`tooltip tooltip--${pos.below ? 'below' : 'above'}`}
      style={{ left: pos.left, top: pos.top }}
      role="tooltip"
    >
      {tip.text}
    </div>,
    document.body,
  );
}
