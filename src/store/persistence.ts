/**
 * store/persistence — save the project to IndexedDB so work survives a refresh.
 *
 * Two stores: 'project' holds the serializable document (one key, 'current');
 * 'media' holds the original imported File blobs keyed by media id. The project
 * is pure JSON so it structured-clones cleanly; media bytes live separately so
 * we don't rewrite them on every edit.
 */
import type { Project } from '../core/model';
import type { MediaId } from '../core/ids';

const DB_NAME = 'video-editor';
const VERSION = 1;
const PROJECT_STORE = 'project';
const MEDIA_STORE = 'media';
const PROJECT_KEY = 'current';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE);
      if (!db.objectStoreNames.contains(MEDIA_STORE)) db.createObjectStore(MEDIA_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  try {
    return await promisify(fn(db.transaction(store, mode).objectStore(store)));
  } finally {
    db.close();
  }
}

export function saveProject(project: Project): Promise<unknown> {
  return withStore(PROJECT_STORE, 'readwrite', (s) => s.put(project, PROJECT_KEY));
}

export function loadProject(): Promise<Project | null> {
  return withStore<Project | undefined>(PROJECT_STORE, 'readonly', (s) => s.get(PROJECT_KEY)).then(
    (p) => p ?? null,
  );
}

export function saveMedia(id: MediaId, file: File): Promise<unknown> {
  return withStore(MEDIA_STORE, 'readwrite', (s) => s.put(file, id));
}

export function loadMedia(id: MediaId): Promise<File | null> {
  return withStore<File | undefined>(MEDIA_STORE, 'readonly', (s) => s.get(id)).then(
    (f) => f ?? null,
  );
}

export function deleteMedia(id: MediaId): Promise<unknown> {
  return withStore(MEDIA_STORE, 'readwrite', (s) => s.delete(id));
}

/** All media-blob keys currently in storage (for garbage-collecting orphans). */
export function listMediaIds(): Promise<string[]> {
  return withStore<IDBValidKey[]>(MEDIA_STORE, 'readonly', (s) => s.getAllKeys()).then((keys) =>
    keys.map((k) => String(k)),
  );
}

export async function clearAll(): Promise<void> {
  await withStore(PROJECT_STORE, 'readwrite', (s) => s.clear());
  await withStore(MEDIA_STORE, 'readwrite', (s) => s.clear());
}
