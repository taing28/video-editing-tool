import { describe, it, expect } from 'vitest';
import { migrateProject } from './migrate';
import type { Project } from '../core/model';

describe('migrateProject — effectOrder', () => {
  it('defaults effectOrder to the effect ids when missing', () => {
    const legacy = {
      clips: {},
      effects: { a: { id: 'a' }, b: { id: 'b' } },
    } as unknown as Project;
    const out = migrateProject(legacy);
    expect(out.effectOrder).toEqual(['a', 'b']);
  });

  it('leaves an existing effectOrder untouched', () => {
    const p = { clips: {}, effects: { a: {}, b: {} }, effectOrder: ['b', 'a'] } as unknown as Project;
    expect(migrateProject(p).effectOrder).toEqual(['b', 'a']);
  });
});
