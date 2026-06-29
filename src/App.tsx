/**
 * App — the editor shell.
 *
 * Layout: toolbar on top; a middle row of [library | preview | inspector];
 * the timeline along the bottom. A single DndContext lets media cards be
 * dragged from the library onto a timeline track.
 */
import { useEffect } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Toolbar } from './ui/Toolbar';
import { MediaLibrary } from './ui/MediaLibrary';
import { Preview } from './ui/Preview';
import { Inspector } from './ui/Inspector';
import { Timeline } from './ui/Timeline';
import { ExportOverlay } from './ui/ExportOverlay';
import { ExportDialog } from './ui/ExportDialog';
import { useEditor } from './store/editorStore';
import { restoreAndStartAutosave } from './store/autosave';
import type { MediaId, TrackId } from './core/ids';
import './App.css';

export default function App() {
  const addClipFromMedia = useEditor((s) => s.addClipFromMedia);
  const togglePlay = useEditor((s) => s.togglePlay);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const removeSelected = useEditor((s) => s.removeSelected);
  const splitSelectedAtPlayhead = useEditor((s) => s.splitSelectedAtPlayhead);

  // Restore any saved project on first mount, then keep autosaving.
  useEffect(() => {
    void restoreAndStartAutosave();
  }, []);

  // A small activation distance so a click on a card doesn't start a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const overId = e.over?.id;
    const mediaId = e.active.data.current?.mediaId as MediaId | undefined;
    if (!mediaId || typeof overId !== 'string' || !overId.startsWith('track:')) return;
    addClipFromMedia(mediaId, overId.slice('track:'.length) as TrackId);
  };

  // Global keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        removeSelected();
      } else if (e.key.toLowerCase() === 's' && !mod) {
        splitSelectedAtPlayhead();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, undo, redo, removeSelected, splitSelectedAtPlayhead]);

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="app">
        <Toolbar />
        <div className="app__middle">
          <MediaLibrary />
          <Preview />
          <Inspector />
        </div>
        <Timeline />
      </div>
      <ExportDialog />
      <ExportOverlay />
    </DndContext>
  );
}
