/**
 * store/autosave — glue between the editor store and IndexedDB persistence.
 *
 * On startup: restore the saved project, rebuilding runtime media from the
 * persisted blobs. After that: debounce-save the document on every change.
 */
import { useEditor } from './editorStore';
import * as persistence from './persistence';
import { migrateProject } from './migrate';
import { reimportFile } from '../media/registry';
import type { MediaId } from '../core/ids';

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let subscribed = false;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void persistence.saveProject(useEditor.getState().project);
  }, 500);
}

export async function restoreAndStartAutosave(): Promise<void> {
  // Test opt-out: tests that need a clean slate load with ?nopersist.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nopersist')) {
    return;
  }
  try {
    const saved = await persistence.loadProject();
    if (saved) {
      // Migrate documents saved by older versions (fields added in later phases).
      migrateProject(saved);
      // Rebuild runtime media (drawables / decoded elements) from saved blobs,
      // and refresh each asset's object URL.
      for (const asset of Object.values(saved.media)) {
        const file = await persistence.loadMedia(asset.id);
        if (file) asset.src = await reimportFile(asset, file);
      }
      useEditor.getState().loadProject(saved);
      // Garbage-collect blobs from deleted media (history isn't persisted, so a
      // delete can't be undone across a reload — orphans are safe to remove).
      const ids = await persistence.listMediaIds();
      for (const id of ids) {
        if (!(id in saved.media)) void persistence.deleteMedia(id as MediaId);
      }
    }
  } catch (err) {
    console.warn('Restore failed:', err);
  }
  // Start autosave AFTER restore so we never overwrite saved data with the
  // initial empty project.
  if (!subscribed) {
    subscribed = true;
    useEditor.subscribe((state, prev) => {
      if (state.project !== prev.project) scheduleSave();
    });
  }
}
