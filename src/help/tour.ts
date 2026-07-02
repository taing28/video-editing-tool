/**
 * help/tour — the guided-tour script for first-time users.
 *
 * Each step spotlights one part of the UI (by selector) with a short
 * plain-language note; together they walk the whole core loop: import media →
 * arrange clips → overlays/voiceover/captions → inspect → export. The engine
 * that renders these lives in ui/Tour.tsx.
 */

export interface TourStep {
  /** CSS selector to spotlight; null = centered card (no highlight). */
  target: string | null;
  title: string;
  body: string;
  /** Left-dock panel that must be open for the target to exist. */
  panel?: 'media' | 'record' | 'text' | 'captions' | 'elements' | 'adjust' | 'settings';
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: null,
    title: 'Welcome! 👋',
    body:
      'This editor works in one simple loop: bring MEDIA in, arrange it as CLIPS on timeline ' +
      'tracks, dress it up with OVERLAYS (text, captions, shapes, voiceover) — then EXPORT a ' +
      'real video file. This quick tour points at each piece. Use Next / Back, or Esc to leave.',
  },
  {
    target: '.dock__rail',
    title: 'The toolbox',
    body:
      'Every tool lives behind one of these icons: Media, Record, Text, Captions, Elements, ' +
      'Adjust and Settings. Press keys 1–7 to jump straight to a panel.',
  },
  {
    target: '.library',
    panel: 'media',
    title: '1 · Import your media',
    body:
      'Click Import (or drop files here) — pictures, video and audio all land in this library. ' +
      'Once you have a few images, the "Make slideshow" button sequences them in one click.',
  },
  {
    target: '.lane--video',
    title: '2 · Put it on the timeline',
    body:
      'Double-click a media card to place it at the playhead, or drag it onto a track. ' +
      'Pictures and video go on video tracks; sound goes on audio tracks.',
  },
  {
    target: '.preview',
    title: '3 · The preview',
    body:
      'Exactly what your exported video will look like. Click any element to select it, drag ' +
      'to move, drag a corner to resize — and double-click text to edit it.',
  },
  {
    target: '.editbar',
    title: '4 · Playback & edit actions',
    body:
      'Play/pause (Space), undo/redo, Split at the playhead (S), Duplicate (⌘/Ctrl+D) and ' +
      'Delete — plus buttons for extra tracks, snapping and timeline zoom.',
  },
  {
    target: '.timeline',
    title: '5 · Arrange your clips',
    body:
      'Click anywhere to move the playhead. Drag a clip to move it, drag its edges to trim. ' +
      'Drag a row’s label (the left gutter) to reorder rows — 📌 pins a row to the top.',
  },
  {
    target: '[data-panel="record"]',
    title: '6 · Record a voiceover',
    body:
      'Narrate straight into the project: put the playhead where speech should start, hit ' +
      'Record, speak, then "Stop & add". Music marked "duck under voice" dips under you automatically.',
  },
  {
    target: '[data-panel="captions"]',
    title: '7 · Captions',
    body:
      'Add captions by hand — or Auto-caption: the audio is transcribed on YOUR device (no ' +
      'upload) into karaoke captions that highlight each word as it’s spoken.',
  },
  {
    target: '[data-panel="text"]',
    title: '8 · Titles & elements',
    body:
      'Text overlays, lower thirds, shapes and stickers. The Readability options (background ' +
      'box, outline, shadow) keep titles legible over any footage.',
  },
  {
    target: '.inspector',
    title: '9 · The Inspector',
    body:
      'Whatever you select — a clip or an overlay — is edited here: duration, speed, ' +
      'transitions, Ken Burns motion, color grading, fades, volume, ducking…',
  },
  {
    target: '.help-btn',
    title: 'Help is one key away',
    body:
      'Press / (or ⌘/Ctrl+K) anytime to search every feature — plain-language "what it is / how ' +
      'to use it" notes, including the full list of keyboard shortcuts.',
  },
  {
    target: '.header .btn--primary',
    title: '10 · Export your video',
    body:
      'When it looks right, Export renders a real MP4 (or WebM) at your chosen resolution and ' +
      'quality. Your work also autosaves in this browser, and 💾 Save bundles the whole project ' +
      'into a portable file. That’s the loop — have fun!',
  },
];
