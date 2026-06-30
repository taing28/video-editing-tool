/**
 * store/migrate — bring a document saved/exported by an older app version up to
 * the current shape (fields added in later phases). Mutates `project` in place
 * and returns it. Used by both autosave-restore and project-file import.
 */
import type { Project } from '../core/model';

export function migrateProject(project: Project): Project {
  for (const clip of Object.values(project.clips)) {
    const c = clip as unknown as {
      speed?: number;
      transition?: string;
      motion?: string;
      duck?: boolean;
      adjust?: { brightness: number; contrast: number; saturate: number };
      kind?: string;
    };
    if (typeof c.speed !== 'number') c.speed = 1;
    if (c.kind !== 'audio' && c.transition === undefined) c.transition = 'dissolve';
    if (c.kind !== 'audio' && c.motion === undefined) c.motion = 'none';
    if (c.kind !== 'audio' && c.adjust === undefined)
      c.adjust = { brightness: 1, contrast: 1, saturate: 1 };
    if (c.kind === 'audio' && typeof c.duck !== 'boolean') c.duck = false;
  }
  return project;
}
