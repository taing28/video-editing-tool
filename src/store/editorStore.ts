/**
 * store/editorStore — the one place UI reads from and writes through.
 *
 * - `project` is the serializable document (the only thing you'd save to disk).
 * - All structural edits go through `commit()`, which snapshots the previous
 *   document for undo. Interactive drags use `begin/transient/` so a whole drag
 *   is ONE undo step, not one per pixel.
 * - The playback clock derives the frame from real elapsed time (never by
 *   counting rAF ticks), so it won't drift.
 */
import { create } from 'zustand';
import type {
  Project,
  Clip,
  TextEffect,
  CaptionEffect,
  ShapeEffect,
  ImageEffect,
  Track,
  TrackKind,
  Transform,
  TransitionType,
  KenBurns,
  ColorAdjust,
  FitMode,
} from '../core/model';
import { createEmptyProject, getTrack, containedBox } from '../core/model';
import type { ClipId, EffectId, MediaId, TrackId } from '../core/ids';
import { newClipId, newEffectId, newTrackId } from '../core/ids';
import type { Frames } from '../core/time';
import { clampFrame, secondsToFrames } from '../core/time';
import {
  addMedia,
  buildSlideshow as buildSlideshowEdit,
  duplicateClip as duplicateClipEdit,
  duplicateEffect as duplicateEffectEdit,
  insertClip,
  insertEffect,
  insertTrack as insertTrackEdit,
  makeClipFromMedia,
  moveClip as moveClipEdit,
  removeClip as removeClipEdit,
  removeEffect as removeEffectEdit,
  removeMedia as removeMediaEdit,
  removeTrack as removeTrackEdit,
  setBackground as setBackgroundEdit,
  setFps as setFpsEdit,
  setProjectName as setProjectNameEdit,
  toggleTrackHidden as toggleTrackHiddenEdit,
  toggleTrackMuted as toggleTrackMutedEdit,
  fitClip as fitClipEdit,
  setCanvasSize as setCanvasSizeEdit,
  setClipAdjust as setClipAdjustEdit,
  setClipDuck as setClipDuckEdit,
  setClipDuration as setClipDurationEdit,
  setClipFade as setClipFadeEdit,
  setClipGain as setClipGainEdit,
  setClipMotion as setClipMotionEdit,
  setClipSpeed as setClipSpeedEdit,
  setClipTransition as setClipTransitionEdit,
  splitClip as splitClipEdit,
  trimClipEnd as trimClipEndEdit,
  trimClipStart as trimClipStartEdit,
  updateEffect as updateEffectEdit,
  moveEffect as moveEffectEdit,
  trimEffectStart as trimEffectStartEdit,
  trimEffectEnd as trimEffectEndEdit,
  reorderEffectRelative as reorderEffectRelativeEdit,
  reorderTrackRelative as reorderTrackRelativeEdit,
  setEffectPinned as setEffectPinnedEdit,
  setTrackPinned as setTrackPinnedEdit,
} from '../core/edits';
import { computeDuration, type TimelineRow } from '../core/selectors';
import { importFile, disposeUnusedMedia } from '../media/registry';
import { exportProject, type ExportOptions } from '../render/export';
import * as audioEngine from '../playback/audioEngine';
import * as persistence from './persistence';
import { buildProjectBundle, bundleFileName, importProjectBundle } from './projectFile';
import { transcribe } from '../captions/transcribe';
import { segmentsToCaptions, mixProjectAudioMono16k } from '../captions/captions';

const HISTORY_LIMIT = 100;

export interface EditorState {
  project: Project;
  selectedClipId: ClipId | null;
  selectedEffectId: EffectId | null;
  playhead: Frames;
  isPlaying: boolean;
  /** Timeline zoom: horizontal pixels per frame. */
  pxPerFrame: number;
  past: Project[];
  future: Project[];

  // export
  isExporting: boolean;
  exportProgress: number; // 0..1
  exportStatus: string | null;
  exportDialogOpen: boolean;
  openExportDialog: () => void;
  closeExportDialog: () => void;
  exportVideo: (opts?: ExportOptions) => Promise<void>;
  cancelExport: () => void;

  // selection
  selectClip: (id: ClipId | null) => void;
  selectEffect: (id: EffectId | null) => void;

  // tracks + canvas + project settings
  addTrack: (kind: TrackKind) => void;
  removeTrack: (trackId: TrackId) => void;
  toggleTrackMuted: (trackId: TrackId) => void;
  toggleTrackHidden: (trackId: TrackId) => void;
  /** Move a row before/after a sibling of the same group (overlay/track). */
  reorderRow: (row: TimelineRow, targetId: string, displayPlace: 'above' | 'below') => void;
  /** Pin/unpin a row so it sticks to the top of the timeline. */
  toggleRowPinned: (row: TimelineRow) => void;
  setCanvasSize: (width: number, height: number) => void;
  renameProject: (name: string) => void;
  setFps: (fps: number) => void;

  // view
  snappingEnabled: boolean;
  toggleSnapping: () => void;

  // media + clips
  importMedia: (files: File[]) => Promise<void>;
  removeMedia: (mediaId: MediaId) => void;
  /** Append every image asset as a timed slideshow on the video track. */
  buildSlideshow: (opts: {
    durationInFrames: number;
    motion: boolean;
    crossfadeFrames: number;
  }) => void;
  addClipFromMedia: (mediaId: MediaId, trackId: TrackId) => void;
  removeSelected: () => void;
  /** Duplicate the selected clip (appended on its track) or overlay (nudged). */
  duplicateSelected: () => void;
  splitSelectedAtPlayhead: () => void;
  /** Overlap the selected video clip with the previous one to create a cross-dissolve. */
  addTransition: () => void;
  setClipDuration: (id: ClipId, duration: Frames) => void;
  setClipTransform: (id: ClipId, transform: Transform) => void;
  setClipGain: (id: ClipId, gain: number) => void;
  setClipDuck: (id: ClipId, duck: boolean) => void;
  setClipFade: (id: ClipId, patch: { fadeInFrames?: number; fadeOutFrames?: number }) => void;
  setClipSpeed: (id: ClipId, speed: number) => void;
  setClipTransition: (id: ClipId, transition: TransitionType) => void;
  setClipMotion: (id: ClipId, motion: KenBurns) => void;
  setClipAdjust: (id: ClipId, patch: Partial<ColorAdjust>) => void;
  fitClip: (id: ClipId, mode: FitMode) => void;
  setBackground: (color: string) => void;

  // interactive drag lifecycle (one undo step per gesture)
  beginInteraction: () => Project;
  setProjectTransient: (project: Project) => void;
  // pure-edit helpers re-exposed so components compute from a captured baseline
  applyMove: (baseline: Project, id: ClipId, startFrame: Frames) => void;
  applyTrimStart: (baseline: Project, id: ClipId, startFrame: Frames) => void;
  applyTrimEnd: (baseline: Project, id: ClipId, endFrame: Frames) => void;
  // same lifecycle, but dragging an overlay block on its timeline lane
  applyEffectMove: (baseline: Project, id: EffectId, startFrame: Frames) => void;
  applyEffectTrimStart: (baseline: Project, id: EffectId, startFrame: Frames) => void;
  applyEffectTrimEnd: (baseline: Project, id: EffectId, endFrame: Frames) => void;

  // effects (text + captions)
  addTextEffect: () => void;
  /** Add an emoji "sticker" as a large text overlay, centered. */
  addSticker: (emoji: string) => void;
  addCaption: () => void;
  addShape: () => void;
  addLowerThird: () => void;
  /** Add an image overlay (e.g. a character cut-out) from a library image asset. */
  addImageOverlay: (mediaId: MediaId) => void;
  updateTextEffect: (id: EffectId, patch: Partial<TextEffect>) => void;
  updateShape: (id: EffectId, patch: Partial<ShapeEffect>) => void;
  updateImageOverlay: (id: EffectId, patch: Partial<ImageEffect>) => void;
  removeEffect: (id: EffectId) => void;
  /** Transcribe the project audio (Whisper) into caption effects. */
  autoCaption: () => Promise<void>;
  isTranscribing: boolean;
  transcribeStatus: string | null;

  // transport
  setPlayhead: (frame: Frames) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;

  // view + history
  setZoom: (pxPerFrame: number) => void;
  undo: () => void;
  redo: () => void;
  newProject: () => void;
  /** Replace the whole document (used by restore-from-storage). */
  loadProject: (project: Project) => void;
  /** Download the whole project (timeline + media) as one portable file. */
  saveProjectFile: () => Promise<void>;
  /** Open a previously-saved project file, replacing the current document. */
  openProjectFile: (file: File) => Promise<void>;
}

// rAF handle for the playback clock (non-reactive, module-scoped).
let rafId: number | null = null;
// True while a burst of renames is being coalesced into one undo entry.
let renameActive = false;
// Active export's abort controller (non-reactive, module-scoped).
let exportAbort: AbortController | null = null;

export const useEditor = create<EditorState>((set, get) => {
  /** Apply a pure edit and record it as one undo step. */
  const commit = (fn: (p: Project) => Project) => {
    renameActive = false; // a structural edit ends any rename-coalescing burst
    const { project, past } = get();
    const next = fn(project);
    if (next === project) return;
    set({ project: next, past: [...past, project].slice(-HISTORY_LIMIT), future: [] });
  };

  const stopClock = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return {
    project: createEmptyProject(),
    selectedClipId: null,
    selectedEffectId: null,
    playhead: 0,
    isPlaying: false,
    pxPerFrame: 6,
    snappingEnabled: true,
    past: [],
    future: [],
    isExporting: false,
    exportProgress: 0,
    exportStatus: null,
    exportDialogOpen: false,
    isTranscribing: false,
    transcribeStatus: null,

    selectClip: (id) => set({ selectedClipId: id, selectedEffectId: null }),
    selectEffect: (id) => set({ selectedEffectId: id, selectedClipId: null }),

    addTrack: (kind) => {
      const { project } = get();
      const count = Object.values(project.tracks).filter((t) => t.kind === kind).length;
      const track: Track = {
        id: newTrackId(),
        kind,
        name: `${kind === 'video' ? 'Video' : 'Audio'} ${count + 1}`,
        clipOrder: [],
        muted: false,
        hidden: false,
      };
      commit((p) => insertTrackEdit(p, track, kind === 'video' ? 'top' : 'bottom'));
    },

    removeTrack: (trackId) => {
      commit((p) => removeTrackEdit(p, trackId));
      set({ selectedClipId: null });
    },

    toggleTrackMuted: (trackId) => commit((p) => toggleTrackMutedEdit(p, trackId)),
    toggleTrackHidden: (trackId) => commit((p) => toggleTrackHiddenEdit(p, trackId)),

    reorderRow: (row, targetId, displayPlace) => {
      if (row.id === targetId) return;
      if (row.type === 'overlay') {
        // Overlay lanes are shown in REVERSE effectOrder, so "above in display"
        // means "later in effectOrder" (more on top) → 'after'.
        const place = displayPlace === 'above' ? 'after' : 'before';
        commit((p) => reorderEffectRelativeEdit(p, row.id as never, targetId as never, place));
      } else {
        // Track lanes are shown in trackOrder forward; "above" = earlier = 'before'.
        const place = displayPlace === 'above' ? 'before' : 'after';
        commit((p) => reorderTrackRelativeEdit(p, row.id as never, targetId as never, place));
      }
    },

    toggleRowPinned: (row) => {
      if (row.type === 'overlay') {
        commit((p) => setEffectPinnedEdit(p, row.id as never, !row.pinned));
      } else {
        commit((p) => setTrackPinnedEdit(p, row.id as never, !row.pinned));
      }
    },

    setCanvasSize: (width, height) => commit((p) => setCanvasSizeEdit(p, width, height)),
    // Rename goes through history, but a typing burst coalesces into ONE undo
    // entry (so later undos can't silently revert the name).
    renameProject: (name) => {
      const { project, past } = get();
      const next = setProjectNameEdit(project, name);
      if (next === project) return;
      if (renameActive) {
        set({ project: next, future: [] }); // same burst → no new history entry
      } else {
        renameActive = true;
        set({ project: next, past: [...past, project].slice(-HISTORY_LIMIT), future: [] });
      }
    },
    setFps: (fps) => commit((p) => setFpsEdit(p, fps)),

    toggleSnapping: () => set((s) => ({ snappingEnabled: !s.snappingEnabled })),

    importMedia: async (files) => {
      const fps = get().project.fps;
      for (const file of files) {
        try {
          const asset = await importFile(file, fps);
          commit((p) => addMedia(p, asset));
          void persistence.saveMedia(asset.id, file); // persist bytes for reload
        } catch (err) {
          console.error(err);
        }
      }
    },

    removeMedia: (mediaId) => {
      const { selectedClipId, project } = get();
      const selectionRemoved =
        selectedClipId != null && project.clips[selectedClipId]?.mediaId === mediaId;
      // Keep the runtime/IDB blob so undo can bring the clips back this session.
      commit((p) => removeMediaEdit(p, mediaId));
      if (selectionRemoved) set({ selectedClipId: null });
    },

    buildSlideshow: (opts) => {
      const imageCount = Object.values(get().project.media).filter(
        (m) => m.kind === 'image',
      ).length;
      if (imageCount === 0) return;
      const ids = Array.from({ length: imageCount }, () => newClipId());
      commit((p) => buildSlideshowEdit(p, ids, opts));
    },

    addClipFromMedia: (mediaId, trackId) => {
      const { project } = get();
      const track = getTrack(project, trackId);
      if (!track) return;
      // Append after the last clip on the track (no overlaps by default).
      const trackEnd = track.clipOrder.reduce((max, cid) => {
        const c = project.clips[cid];
        return c ? Math.max(max, c.startFrame + c.durationInFrames) : max;
      }, 0);
      const id = newClipId();
      const clip = makeClipFromMedia(project, { id, mediaId, track, startFrame: trackEnd });
      if (!clip) return;
      commit((p) => insertClip(p, clip));
      set({ selectedClipId: id, selectedEffectId: null });
    },

    removeSelected: () => {
      const { selectedClipId, selectedEffectId } = get();
      if (selectedClipId) {
        commit((p) => removeClipEdit(p, selectedClipId));
        set({ selectedClipId: null });
      } else if (selectedEffectId) {
        commit((p) => removeEffectEdit(p, selectedEffectId));
        set({ selectedEffectId: null });
      }
    },

    duplicateSelected: () => {
      const { selectedClipId, selectedEffectId } = get();
      if (selectedClipId) {
        const newId = newClipId();
        commit((p) => duplicateClipEdit(p, selectedClipId, newId));
        set({ selectedClipId: newId, selectedEffectId: null });
      } else if (selectedEffectId) {
        const newId = newEffectId();
        commit((p) => duplicateEffectEdit(p, selectedEffectId, newId));
        set({ selectedEffectId: newId, selectedClipId: null });
      }
    },

    splitSelectedAtPlayhead: () => {
      const { selectedClipId, playhead } = get();
      if (!selectedClipId) return;
      commit((p) => splitClipEdit(p, selectedClipId, playhead, newClipId()));
    },

    addTransition: () => {
      const { selectedClipId } = get();
      if (!selectedClipId) return;
      commit((p) => {
        const clip = p.clips[selectedClipId];
        if (!clip || clip.kind === 'audio') return p; // video cross-dissolve only
        const track = p.tracks[clip.trackId];
        if (!track) return p;
        const idx = track.clipOrder.indexOf(selectedClipId);
        if (idx <= 0) return p; // needs a previous clip on the same track
        const prev = p.clips[track.clipOrder[idx - 1]];
        if (!prev) return p;
        const n = secondsToFrames(0.5, p.fps);
        const newStart = Math.max(prev.startFrame + 1, prev.startFrame + prev.durationInFrames - n);
        return moveClipEdit(p, selectedClipId, newStart);
      });
    },

    setClipDuration: (id, duration) => commit((p) => setClipDurationEdit(p, id, duration)),

    setClipTransform: (id, transform) =>
      commit((p) => {
        const clip = p.clips[id];
        if (!clip || clip.kind === 'audio') return p;
        return { ...p, clips: { ...p.clips, [id]: { ...clip, transform } } };
      }),

    setClipGain: (id, gain) => commit((p) => setClipGainEdit(p, id, gain)),
    setClipDuck: (id, duck) => commit((p) => setClipDuckEdit(p, id, duck)),
    setClipFade: (id, patch) => commit((p) => setClipFadeEdit(p, id, patch)),
    setClipSpeed: (id, speed) => commit((p) => setClipSpeedEdit(p, id, speed)),
    setClipTransition: (id, transition) =>
      commit((p) => setClipTransitionEdit(p, id, transition)),
    setClipMotion: (id, motion) => commit((p) => setClipMotionEdit(p, id, motion)),
    setClipAdjust: (id, patch) => commit((p) => setClipAdjustEdit(p, id, patch)),
    fitClip: (id, mode) => commit((p) => fitClipEdit(p, id, mode)),
    setBackground: (color) => commit((p) => setBackgroundEdit(p, color)),

    beginInteraction: () => {
      const { project, past } = get();
      set({ past: [...past, project].slice(-HISTORY_LIMIT), future: [] });
      return project;
    },
    setProjectTransient: (project) => set({ project }),
    applyMove: (baseline, id, startFrame) =>
      set({ project: moveClipEdit(baseline, id, startFrame) }),
    applyTrimStart: (baseline, id, startFrame) =>
      set({ project: trimClipStartEdit(baseline, id, startFrame) }),
    applyTrimEnd: (baseline, id, endFrame) =>
      set({ project: trimClipEndEdit(baseline, id, endFrame) }),
    applyEffectMove: (baseline, id, startFrame) =>
      set({ project: moveEffectEdit(baseline, id, startFrame) }),
    applyEffectTrimStart: (baseline, id, startFrame) =>
      set({ project: trimEffectStartEdit(baseline, id, startFrame) }),
    applyEffectTrimEnd: (baseline, id, endFrame) =>
      set({ project: trimEffectEndEdit(baseline, id, endFrame) }),

    addTextEffect: () => {
      const { project, playhead } = get();
      const id = newEffectId();
      const durationInFrames = secondsToFrames(3, project.fps);
      const effect: TextEffect = {
        id,
        type: 'text',
        timing: { start: playhead, duration: durationInFrames },
        text: 'Your text',
        fontSize: Math.round(project.height / 12),
        fontWeight: 700,
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#ffffff',
        x: Math.round(project.width * 0.12),
        y: Math.round(project.height * 0.44),
        align: 'left',
      };
      commit((p) => insertEffect(p, effect));
      set({ selectedEffectId: id, selectedClipId: null });
    },

    addSticker: (emoji) => {
      const { project, playhead } = get();
      const id = newEffectId();
      const size = Math.round(project.height / 4);
      const effect: TextEffect = {
        id,
        type: 'text',
        timing: { start: playhead, duration: secondsToFrames(3, project.fps) },
        text: emoji,
        fontSize: size,
        fontWeight: 400,
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#ffffff',
        x: Math.round(project.width / 2 - size / 2),
        y: Math.round(project.height / 2 - size / 2),
        align: 'left',
      };
      commit((p) => insertEffect(p, effect));
      set({ selectedEffectId: id, selectedClipId: null });
    },

    addCaption: () => {
      const { project, playhead } = get();
      const id = newEffectId();
      const effect: CaptionEffect = {
        id,
        type: 'caption',
        timing: { start: playhead, duration: secondsToFrames(2, project.fps) },
        text: 'Caption text',
        fontSize: Math.round(project.height / 20),
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#ffffff',
      };
      commit((p) => insertEffect(p, effect));
      set({ selectedEffectId: id, selectedClipId: null });
    },

    addShape: () => {
      const { project, playhead } = get();
      const id = newEffectId();
      const w = Math.round(project.width * 0.4);
      const h = Math.round(project.height * 0.2);
      const effect: ShapeEffect = {
        id,
        type: 'shape',
        timing: { start: playhead, duration: secondsToFrames(3, project.fps) },
        x: Math.round((project.width - w) / 2),
        y: Math.round((project.height - h) / 2),
        width: w,
        height: h,
        color: '#5b8cff',
        opacity: 0.85,
      };
      commit((p) => insertEffect(p, effect));
      set({ selectedEffectId: id, selectedClipId: null });
    },

    addLowerThird: () => {
      const { project, playhead } = get();
      const shapeId = newEffectId();
      const textId = newEffectId();
      const duration = secondsToFrames(3, project.fps);
      const barY = Math.round(project.height * 0.78);
      const barH = Math.round(project.height * 0.14);
      const shape: ShapeEffect = {
        id: shapeId,
        type: 'shape',
        timing: { start: playhead, duration },
        x: 0,
        y: barY,
        width: project.width,
        height: barH,
        color: '#000000',
        opacity: 0.55,
      };
      const text: TextEffect = {
        id: textId,
        type: 'text',
        timing: { start: playhead, duration },
        text: 'Lower third',
        fontSize: Math.round(project.height / 24),
        fontWeight: 700,
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#ffffff',
        x: Math.round(project.width * 0.05),
        y: barY + Math.round(barH * 0.28),
        align: 'left',
      };
      // Shape first so it sits behind the text.
      commit((p) => insertEffect(insertEffect(p, shape), text));
      set({ selectedEffectId: textId, selectedClipId: null });
    },

    addImageOverlay: (mediaId) => {
      const { project, playhead } = get();
      const media = project.media[mediaId];
      if (!media || media.kind !== 'image') return;
      const id = newEffectId();
      // Start at 60% of a contained fit so it reads as an overlay, not a fill.
      const fit = containedBox(
        media.width ?? project.width,
        media.height ?? project.height,
        project.width,
        project.height,
      );
      const width = Math.round(fit.width * 0.6);
      const height = Math.round(fit.height * 0.6);
      const effect: ImageEffect = {
        id,
        type: 'image',
        timing: { start: playhead, duration: secondsToFrames(3, project.fps) },
        mediaId,
        x: Math.round((project.width - width) / 2),
        y: Math.round((project.height - height) / 2),
        width,
        height,
        opacity: 1,
      };
      commit((p) => insertEffect(p, effect));
      set({ selectedEffectId: id, selectedClipId: null });
    },

    updateTextEffect: (id, patch) => commit((p) => updateEffectEdit(p, id, patch)),
    updateShape: (id, patch) => commit((p) => updateEffectEdit(p, id, patch)),
    updateImageOverlay: (id, patch) => commit((p) => updateEffectEdit(p, id, patch)),

    removeEffect: (id) => {
      commit((p) => removeEffectEdit(p, id));
      if (get().selectedEffectId === id) set({ selectedEffectId: null });
    },

    autoCaption: async () => {
      if (get().isTranscribing) return;
      get().pause();
      set({ isTranscribing: true, transcribeStatus: 'Preparing audio…' });
      try {
        const project = get().project;
        const pcm = await mixProjectAudioMono16k(project);
        if (!pcm) {
          set({ isTranscribing: false, transcribeStatus: null });
          alert('Add an audio track first — auto-captions transcribe the audio.');
          return;
        }
        const segments = await transcribe(pcm, 16000, (status) => set({ transcribeStatus: status }));
        const captions = segmentsToCaptions(segments, project.fps, {
          fontSize: Math.round(project.height / 20),
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#ffffff',
        });
        set({ isTranscribing: false, transcribeStatus: null });
        if (captions.length === 0) {
          alert('No speech detected in the audio.');
          return;
        }
        commit((p) => captions.reduce((acc, c) => insertEffect(acc, c), p));
      } catch (err) {
        console.error('Auto-caption failed:', err);
        set({ isTranscribing: false, transcribeStatus: null });
        alert(`Auto-caption failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    setPlayhead: (frame) => {
      const { project } = get();
      const max = Math.max(0, computeDuration(project) - 1);
      set({ playhead: clampFrame(Math.round(frame), 0, Math.max(0, max)) });
    },

    play: () => {
      const state = get();
      if (state.isPlaying) return;
      const duration = computeDuration(state.project);
      if (duration <= 0) return;
      const fps = state.project.fps;
      // Anchor the clock to wall time so the frame is derived, never counted.
      const anchorTime = performance.now();
      const anchorFrame = state.playhead >= duration - 1 ? 0 : state.playhead;
      set({ isPlaying: true, playhead: anchorFrame });

      const tick = () => {
        const elapsed = (performance.now() - anchorTime) / 1000;
        const frame = anchorFrame + secondsToFrames(elapsed, fps);
        if (frame >= duration - 1) {
          set({ playhead: Math.max(0, duration - 1), isPlaying: false });
          audioEngine.stop();
          stopClock();
          return;
        }
        set({ playhead: frame });
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      // Schedule audio (async decode + play); fire-and-forget.
      void audioEngine.start(state.project, anchorFrame, fps);
    },

    pause: () => {
      stopClock();
      audioEngine.stop();
      set({ isPlaying: false });
    },

    togglePlay: () => {
      if (get().isPlaying) get().pause();
      else get().play();
    },

    setZoom: (pxPerFrame) => set({ pxPerFrame: Math.max(0.5, Math.min(40, pxPerFrame)) }),

    openExportDialog: () => set({ exportDialogOpen: true }),
    closeExportDialog: () => set({ exportDialogOpen: false }),
    cancelExport: () => exportAbort?.abort(),

    exportVideo: async (opts = {}) => {
      if (get().isExporting) return;
      get().pause();
      const controller = new AbortController();
      exportAbort = controller;
      set({
        isExporting: true,
        exportProgress: 0,
        exportStatus: 'Preparing encoder…',
        exportDialogOpen: false,
      });
      try {
        const result = await exportProject(get().project, {
          ...opts,
          signal: controller.signal,
          onProgress: (f) =>
            set({ exportProgress: f, exportStatus: `Rendering ${Math.round(f * 100)}%` }),
        });
        // Trigger a download of the finished file.
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        set({ isExporting: false, exportProgress: 1, exportStatus: null });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          set({ isExporting: false, exportProgress: 0, exportStatus: null });
          return;
        }
        console.error('Export failed:', err);
        set({ isExporting: false, exportProgress: 0, exportStatus: null });
        alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        exportAbort = null;
      }
    },

    undo: () => {
      renameActive = false;
      const { past, project, future } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      set({
        project: previous,
        past: past.slice(0, -1),
        future: [project, ...future].slice(0, HISTORY_LIMIT),
        selectedClipId: null,
        selectedEffectId: null,
      });
    },

    redo: () => {
      renameActive = false;
      const { past, project, future } = get();
      if (future.length === 0) return;
      const next = future[0];
      set({
        project: next,
        past: [...past, project].slice(-HISTORY_LIMIT),
        future: future.slice(1),
        selectedClipId: null,
        selectedEffectId: null,
      });
    },

    newProject: () => {
      stopClock();
      audioEngine.stop();
      disposeUnusedMedia(new Set()); // a fresh project has no media
      set({
        project: createEmptyProject(),
        selectedClipId: null,
        selectedEffectId: null,
        playhead: 0,
        isPlaying: false,
        past: [],
        future: [],
      });
    },

    loadProject: (project) => {
      stopClock();
      audioEngine.stop();
      // Free the outgoing project's runtime media (URLs + blobs); history is
      // reset on load, so the old media can't be brought back by undo.
      disposeUnusedMedia(new Set(Object.keys(project.media)));
      set({
        project,
        selectedClipId: null,
        selectedEffectId: null,
        playhead: 0,
        isPlaying: false,
        past: [],
        future: [],
      });
    },

    saveProjectFile: async () => {
      const project = get().project;
      const blob = await buildProjectBundle(project);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = bundleFileName(project);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },

    openProjectFile: async (file) => {
      const text = await file.text();
      const project = await importProjectBundle(text); // rebuilds media first
      get().loadProject(project);
    },
  };
});

// Dev-only test hook so end-to-end tests can read store state. Tree-shaken out
// of production builds (import.meta.env.DEV is false there).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __editor?: typeof useEditor }).__editor = useEditor;
}

/** Selector helper: the currently selected clip object (or null). */
export function useSelectedClip(): Clip | null {
  return useEditor((s) => (s.selectedClipId ? s.project.clips[s.selectedClipId] ?? null : null));
}

/** Selector helper: the currently selected text effect (or null). */
export function useSelectedTextEffect(): TextEffect | null {
  return useEditor((s) => {
    if (!s.selectedEffectId) return null;
    const e = s.project.effects[s.selectedEffectId];
    return e && e.type === 'text' ? e : null;
  });
}

/** Selector helper: the currently selected caption (or null). */
export function useSelectedCaption(): CaptionEffect | null {
  return useEditor((s) => {
    if (!s.selectedEffectId) return null;
    const e = s.project.effects[s.selectedEffectId];
    return e && e.type === 'caption' ? e : null;
  });
}

/** Selector helper: the currently selected shape (or null). */
export function useSelectedShape(): ShapeEffect | null {
  return useEditor((s) => {
    if (!s.selectedEffectId) return null;
    const e = s.project.effects[s.selectedEffectId];
    return e && e.type === 'shape' ? e : null;
  });
}

/** Selector helper: the currently selected image overlay (or null). */
export function useSelectedImageEffect(): ImageEffect | null {
  return useEditor((s) => {
    if (!s.selectedEffectId) return null;
    const e = s.project.effects[s.selectedEffectId];
    return e && e.type === 'image' ? e : null;
  });
}
