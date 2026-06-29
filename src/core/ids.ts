/**
 * core/ids — branded string IDs.
 *
 * Branding makes a TrackId structurally distinct from a ClipId at compile time
 * even though both are strings at runtime, so you can't accidentally pass the
 * wrong key into a lookup.
 */
import { nanoid } from 'nanoid';

declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type ProjectId = Brand<string, 'ProjectId'>;
export type TrackId = Brand<string, 'TrackId'>;
export type ClipId = Brand<string, 'ClipId'>;
export type MediaId = Brand<string, 'MediaId'>;
export type EffectId = Brand<string, 'EffectId'>;

export const newProjectId = () => nanoid() as ProjectId;
export const newTrackId = () => nanoid() as TrackId;
export const newClipId = () => nanoid() as ClipId;
export const newMediaId = () => nanoid() as MediaId;
export const newEffectId = () => nanoid() as EffectId;
