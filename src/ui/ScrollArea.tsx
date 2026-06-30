/**
 * ui/ScrollArea — a reusable scroll container with a styled, shadcn-style
 * scrollbar (thin track, rounded thumb, fades in on hover). Built on the
 * Radix ScrollArea primitive (which renders its OWN thumb elements over a
 * natively-scrolling viewport) and dressed with plain CSS — no Tailwind.
 *
 * Use `orientation="both"` for surfaces that scroll in two axes (the timeline);
 * the default vertical bar suits side panels.
 */
import * as RScrollArea from '@radix-ui/react-scroll-area';
import type { ReactNode, Ref } from 'react';

type Orientation = 'vertical' | 'horizontal' | 'both';

export function ScrollArea({
  children,
  className,
  orientation = 'vertical',
  type = 'hover',
  viewportRef,
}: {
  children: ReactNode;
  className?: string;
  orientation?: Orientation;
  /** When the scrollbar is shown — Radix `type` (hover = shadcn feel). */
  type?: 'auto' | 'always' | 'scroll' | 'hover';
  /** Access the scrolling viewport element (e.g. to read/set scroll offset). */
  viewportRef?: Ref<HTMLDivElement>;
}) {
  const showV = orientation === 'vertical' || orientation === 'both';
  const showH = orientation === 'horizontal' || orientation === 'both';
  return (
    <RScrollArea.Root className={`scroll-area${className ? ` ${className}` : ''}`} type={type}>
      <RScrollArea.Viewport ref={viewportRef} className="scroll-area__viewport">
        {children}
      </RScrollArea.Viewport>
      {showV && <Bar orientation="vertical" />}
      {showH && <Bar orientation="horizontal" />}
      <RScrollArea.Corner className="scroll-area__corner" />
    </RScrollArea.Root>
  );
}

function Bar({ orientation }: { orientation: 'vertical' | 'horizontal' }) {
  return (
    <RScrollArea.Scrollbar
      orientation={orientation}
      className={`scroll-area__scrollbar scroll-area__scrollbar--${orientation}`}
    >
      <RScrollArea.Thumb className="scroll-area__thumb" />
    </RScrollArea.Scrollbar>
  );
}
