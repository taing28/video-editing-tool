/**
 * ui/Sidebar — a collapsible, drag-to-resize side panel.
 *
 * Width + collapsed state persist to localStorage. Collapsing animates the
 * width to 0 (the inner content keeps its width and is clipped, so it slides
 * out cleanly). A floating toggle stays reachable even when collapsed.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const MIN_WIDTH = 180;
const MAX_WIDTH = 480;

function loadWidth(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(`${key}:w`));
    return Number.isFinite(v) && v >= MIN_WIDTH && v <= MAX_WIDTH ? v : fallback;
  } catch {
    return fallback;
  }
}

function loadCollapsed(key: string): boolean {
  try {
    return localStorage.getItem(`${key}:c`) === '1';
  } catch {
    return false;
  }
}

export function Sidebar({
  side,
  storageKey,
  label,
  defaultWidth = 260,
  children,
}: {
  side: 'left' | 'right';
  storageKey: string;
  label: string;
  defaultWidth?: number;
  children: ReactNode;
}) {
  const [width, setWidth] = useState(() => loadWidth(storageKey, defaultWidth));
  const [collapsed, setCollapsed] = useState(() => loadCollapsed(storageKey));
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}:w`, String(width));
      localStorage.setItem(`${storageKey}:c`, collapsed ? '1' : '0');
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [width, collapsed, storageKey]);

  const onResizeDown = (e: React.PointerEvent) => {
    if (collapsed) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const next = side === 'left' ? startW + dx : startW - dx;
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(next))));
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

  const chevron =
    side === 'left' ? (collapsed ? '›' : '‹') : collapsed ? '‹' : '›';

  return (
    <div
      className={`sidebar sidebar--${side}${collapsed ? ' is-collapsed' : ''}${
        dragging ? ' is-dragging' : ''
      }`}
      style={{ width: collapsed ? 0 : width }}
    >
      <div className="sidebar__clip">
        <div className="sidebar__inner" style={{ width }}>
          {children}
        </div>
      </div>
      {!collapsed && (
        <div
          className="sidebar__resize"
          onPointerDown={onResizeDown}
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${label}`}
        />
      )}
      <button
        className="sidebar__toggle"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? `Show ${label}` : `Hide ${label}`}
        aria-label={collapsed ? `Show ${label}` : `Hide ${label}`}
        aria-expanded={!collapsed}
      >
        {chevron}
      </button>
    </div>
  );
}
