/**
 * store/projectFile — save/open a whole project (timeline + media) as ONE
 * portable file, so work can be backed up, shared, or moved between machines.
 *
 * The browser only autosaves to THIS origin's IndexedDB; a project file is the
 * escape hatch. Format: a JSON bundle with the pure-JSON Project plus every
 * media asset's bytes embedded as a data URL (dependency-free, no zip lib).
 * Large videos make the file big — fine for the voice+picture projects this
 * tool targets.
 */
import type { Project } from '../core/model';
import type { MediaId } from '../core/ids';
import { getMediaFile, reimportFile } from '../media/registry';
import * as persistence from './persistence';
import { migrateProject } from './migrate';

const FORMAT = 'video-editor-project';
const VERSION = 1;

interface BundleMedia {
  name: string;
  type: string;
  /** A `data:<type>;base64,...` URL of the file bytes. */
  data: string;
}

interface Bundle {
  format: string;
  version: number;
  project: Project;
  media: Record<string, BundleMedia>;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read media'));
    reader.readAsDataURL(file);
  });
}

/** A filesystem-safe `<name>.videoproj.json` for the download. */
export function bundleFileName(project: Project): string {
  const safe = (project.name || 'project').replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '');
  return `${safe || 'project'}.videoproj.json`;
}

/** Serialize the project + its media bytes into one downloadable JSON Blob. */
export async function buildProjectBundle(project: Project): Promise<Blob> {
  const media: Record<string, BundleMedia> = {};
  for (const asset of Object.values(project.media)) {
    const file = getMediaFile(asset.id);
    if (!file) continue; // no runtime bytes (shouldn't happen) — omit
    media[asset.id] = { name: file.name, type: file.type, data: await readAsDataURL(file) };
  }
  // Runtime object-URL `src`es are meaningless once written out; blank them so a
  // reader never trusts a stale URL (import regenerates them).
  const cleanProject: Project = {
    ...project,
    media: Object.fromEntries(
      Object.entries(project.media).map(([id, a]) => [id, { ...a, src: '' }]),
    ),
  };
  const bundle: Bundle = { format: FORMAT, version: VERSION, project: cleanProject, media };
  return new Blob([JSON.stringify(bundle)], { type: 'application/json' });
}

/**
 * Parse a bundle's text, rebuild each media asset's runtime drawable from the
 * embedded bytes (and persist it for reload), and return a migrated Project
 * ready to hand to the store's `loadProject`. Throws on a malformed file.
 */
export async function importProjectBundle(text: string): Promise<Project> {
  let parsed: Bundle;
  try {
    parsed = JSON.parse(text) as Bundle;
  } catch {
    throw new Error('Not a valid project file (could not parse JSON).');
  }
  if (!parsed || parsed.format !== FORMAT || !parsed.project?.media) {
    throw new Error('Not a valid project file.');
  }
  const project = migrateProject(parsed.project);
  for (const asset of Object.values(project.media)) {
    const m = parsed.media?.[asset.id];
    if (!m) continue;
    const blob = await (await fetch(m.data)).blob();
    const file = new File([blob], m.name || asset.name, { type: m.type || blob.type });
    asset.src = await reimportFile(asset, file);
    void persistence.saveMedia(asset.id as MediaId, file);
  }
  return project;
}
