/**
 * help/guide — plain-language docs for each feature, shown in the Help panel
 * and (the short `tip`) as hover tooltips. Keep entries beginner-friendly.
 */
export interface GuideEntry {
  name: string;
  category: string;
  /** One-line summary — also used as the hover tooltip. */
  tip: string;
  /** What it is. */
  what: string;
  /** How to use it. */
  how: string;
}

export const GUIDE: GuideEntry[] = [
  {
    name: 'Import media',
    category: 'Media',
    tip: 'Add images, video or audio from your computer.',
    what: 'Brings pictures, video clips or audio files into the project so you can use them.',
    how: 'Click Import in the Media panel (left), or drag files onto it. Imported items appear as cards you can drag onto a track or double-click to add.',
  },
  {
    name: 'Add to timeline',
    category: 'Media',
    tip: 'Double-click a media card, or drag it onto a track.',
    what: 'Places a piece of media on a track as a "clip" at a point in time.',
    how: 'Double-click a card to place it at the playhead (or after the last clip if that spot is taken), or drag the card onto a track. Images get a default 5-second length.',
  },
  {
    name: 'Guided tour (tutorial)',
    category: 'General',
    tip: 'A step-by-step walkthrough from import to export.',
    what: 'A spotlight tour for new users: it highlights each part of the editor in order — import media, arrange clips, preview, voiceover, captions, inspector — ending at Export. Offered automatically on your first visit in a browser.',
    how: 'Click the 🎓 Tour button in the header any time to replay it. Use Next / Back (or ←/→), Esc to leave. Whether you finished or skipped it is remembered in this browser.',
  },
  {
    name: 'Keyboard shortcuts',
    category: 'General',
    tip: 'Space, arrows, 1-7 panels, T/C add, /=search, S, Delete, ⌘Z/⌘D/⌘S/⌘E/⌘K.',
    what: 'Fast keys for the common editing actions. All bindings avoid keys the browser reserves (⌘T/⌘W/⌘L never reach the page), and the ones the browser merely defaults (⌘S, ⌘K, /) are intercepted so they act on the editor instead.',
    how: 'Space = play/pause · ←/→ = step one frame (Shift = 1 second) · Home/End = start/end · 1–7 = switch left-dock panels (again = collapse) · T = add text · C = add caption · / or ⌘/Ctrl+K = search this guide · S = split at playhead · Delete = remove selection · Esc = deselect · ⌘/Ctrl+Z = undo (Shift = redo) · ⌘/Ctrl+D = duplicate · ⌘/Ctrl+S = save project file · ⌘/Ctrl+E = export. Keys do nothing while you are typing in a field.',
  },
  {
    name: 'Text readability',
    category: 'Overlays',
    tip: 'Background box, outline and shadow so text reads on any footage.',
    what: 'Styling that keeps a text overlay legible over busy or bright video: a padded box behind it, a dark outline around the letters, or a soft shadow.',
    how: 'Select a text overlay and open the Readability section in the Inspector: toggle Background box (with color + opacity), Outline, or Shadow. They apply in the preview and the export identically.',
  },
  {
    name: 'Record voiceover',
    category: 'Audio',
    tip: 'Record narration from your mic straight onto the timeline.',
    what: 'Captures your voice with the microphone and adds it as an audio clip — the fastest way to narrate a picture story.',
    how: 'Open Record (left dock), move the playhead to where the narration should start, hit Record, speak, then Stop & add. Music clips with "Duck under voice" automatically dip under it.',
  },
  {
    name: 'Stickers',
    category: 'Overlays',
    tip: 'One-click emoji overlays (⭐ 🔥 😂 …).',
    what: 'Big emoji placed on top of the video — quick reactions and accents, stored as text overlays.',
    how: 'Open Elements (left dock) and click an emoji. Drag it on the preview to position, resize by a corner; set timing in the Inspector like any text overlay.',
  },
  {
    name: 'Trim',
    category: 'Timeline',
    tip: 'Drag a clip’s left/right edge to shorten or lengthen it.',
    what: 'Changes where a clip starts or ends without moving the rest.',
    how: 'Hover a clip and drag its left or right edge. For video/audio you can only extend up to the source length.',
  },
  {
    name: 'Split',
    category: 'Timeline',
    tip: 'Cut the selected clip in two at the playhead.',
    what: 'Slices one clip into two separate clips at the current time, so you can delete or move each half.',
    how: 'Move the playhead (click the ruler) to where you want the cut, select the clip, then press Split (or the S key).',
  },
  {
    name: 'Duplicate',
    category: 'Timeline',
    tip: 'Make a copy of the selected clip or overlay (Ctrl/Cmd+D).',
    what: 'Creates an identical copy — same length, effects, color and motion — so you can reuse a setup.',
    how: 'Select a clip or overlay and press Duplicate (or Ctrl/Cmd+D). A clip copy is added at the end of its track; an overlay copy appears slightly offset.',
  },
  {
    name: 'Snapping',
    category: 'Timeline',
    tip: 'Clips magnetically align to edges, the playhead and 0.',
    what: 'When ON, dragging a clip makes its edges "stick" to other clips’ edges, the playhead, and the start of the timeline — so there are no tiny gaps or overlaps.',
    how: 'Toggle the "Snap on/off" button under the preview. Turn it off when you want completely free positioning.',
  },
  {
    name: 'Transition',
    category: 'Effects',
    tip: 'How a clip blends in when it overlaps the previous one.',
    what: 'The visual blend between two video/image clips on the same track where they overlap. Dissolve = cross-fade; Wipe = the new clip is revealed left-to-right; Slide = the new clip slides in from the side.',
    how: 'Overlap two clips (drag one onto the other, or select the later clip and press "Add transition"). Then pick the style in the inspector’s Transition dropdown. The overlap region is where the transition plays.',
  },
  {
    name: 'Add transition',
    category: 'Effects',
    tip: 'Overlap the selected clip with the previous one to create a transition.',
    what: 'A shortcut that nudges the selected clip to overlap its left neighbour by half a second, creating a transition region.',
    how: 'Select a clip that has another clip before it on the same track, then press "Add transition". Change the style with the Transition dropdown.',
  },
  {
    name: 'Motion (Ken Burns)',
    category: 'Effects',
    tip: 'Slow pan/zoom over a still image.',
    what: 'Animates a gentle zoom-in/out or pan across a clip over its duration, so still photos feel alive (the classic "Ken Burns" effect).',
    how: 'Select an image/video clip and choose a Motion (Zoom in/out, Pan left/right) in the inspector. It animates while playing and in the export; it freezes while you’re positioning the clip.',
  },
  {
    name: 'Speed',
    category: 'Effects',
    tip: 'Play a clip faster or slower.',
    what: 'Changes playback speed (0.25× slow-motion up to 4× fast). Faster makes the clip shorter on the timeline; slower makes it longer.',
    how: 'Select a video or audio clip and pick a Speed in the inspector. The clip keeps the same content, just re-timed.',
  },
  {
    name: 'Fade in / out (clip)',
    category: 'Effects',
    tip: 'Ramp a clip up from / down to nothing.',
    what: 'For video, fades opacity from/to transparent; for audio, fades the volume. Great for smooth starts and endings.',
    how: 'Select a clip and set Fade in / Fade out (seconds) in the inspector.',
  },
  {
    name: 'Duck under voice',
    category: 'Audio',
    tip: 'Auto-lower music while other audio (voice) plays.',
    what: 'Automatically drops a music clip’s volume whenever any non-ducked audio (your voiceover) is playing, so narration stays clear, then brings it back up.',
    how: 'Put your voice on one audio clip and music on another. Select the music clip and tick "Duck under voice".',
  },
  {
    name: 'Volume',
    category: 'Audio',
    tip: 'Set how loud an audio clip is.',
    what: 'A per-clip loudness control (0%–200%).',
    how: 'Select an audio clip and drag the Volume slider in the inspector.',
  },
  {
    name: 'Color grading',
    category: 'Effects',
    tip: 'Adjust brightness, contrast and saturation.',
    what: 'Tweaks the look of an image or video clip: brightness (lighter/darker), contrast (punchier), saturation (more/less colorful). Includes B&W and Vivid presets.',
    how: 'Select an image or video clip and use the Color sliders in the inspector. The preview matches the exported result.',
  },
  {
    name: 'Frame fit (Fit / Fill / Stretch)',
    category: 'Layout',
    tip: 'Fit, crop-to-fill, or stretch a clip into the canvas.',
    what: 'Decides how a clip maps into the canvas. Fit = whole image with bars (letterbox); Fill = crop to fill the frame (great for putting a landscape photo in a vertical video); Stretch = force-fit (may distort).',
    how: 'Select a visual clip and press Fit, Fill or Stretch in the inspector. After Fill, drag on the preview to reposition the crop.',
  },
  {
    name: 'Text overlay',
    category: 'Overlays',
    tip: 'Add a text title you can place anywhere.',
    what: 'Free-floating text on top of the video with control over size, weight, color and timing.',
    how: 'Press "Add text", type in the inspector, then drag it on the preview to position; drag a corner to resize.',
  },
  {
    name: 'Caption',
    category: 'Overlays',
    tip: 'Add a centered, outlined subtitle at the bottom.',
    what: 'A subtitle styled for readability (centered near the bottom with an outline), ideal for spoken lines.',
    how: 'Press "CC Caption", type the text and set its timing in the inspector.',
  },
  {
    name: 'Auto-caption',
    category: 'Overlays',
    tip: 'Transcribe your audio into captions automatically.',
    what: 'Listens to the project’s audio on your device (no upload) and creates timed captions from the speech.',
    how: 'Add audio with speech, then press "Auto-caption" and wait for it to transcribe. The first run downloads a small model.',
  },
  {
    name: 'Shape',
    category: 'Overlays',
    tip: 'Add a colored rectangle / block.',
    what: 'A solid rectangle you can size, color and time — useful as a background bar or highlight.',
    how: 'Press "Shape", then drag it on the preview to move and resize; set color/opacity/timing in the inspector.',
  },
  {
    name: 'Lower third',
    category: 'Overlays',
    tip: 'Add a name bar (rectangle + text) near the bottom.',
    what: 'A common TV-style caption: a colored bar with text on top, placed in the lower part of the frame.',
    how: 'Press "Lower third". It adds a bar and a text overlay together — edit each by selecting it.',
  },
  {
    name: 'Overlay fade',
    category: 'Overlays',
    tip: 'Fade a text/caption/shape in and out.',
    what: 'Ramps an overlay’s opacity at its start and end so titles and subtitles appear/disappear smoothly instead of popping.',
    how: 'Select an overlay and set Fade in / Fade out (seconds) in the inspector.',
  },
  {
    name: 'Tracks (mute / hide / delete)',
    category: 'Timeline',
    tip: 'Each row can be muted (audio) or hidden (video).',
    what: 'Tracks are the stacked rows that hold clips. The toggle on a video row (eye) shows/hides it; on an audio row (speaker) mutes it. A hidden video track makes the preview show only the background.',
    how: 'Use the small icons on the left of each track. Add more rows with +Video / +Audio. If your preview is unexpectedly blank, check the video track isn’t hidden.',
  },
  {
    name: 'Background color',
    category: 'Layout',
    tip: 'The fill shown behind/around your clips.',
    what: 'The solid color of the canvas where no clip covers it (the letterbox area). Black by default.',
    how: 'Deselect everything to see the Project panel, then pick a Background color.',
  },
  {
    name: 'Canvas size / aspect',
    category: 'Layout',
    tip: 'The output shape: 16:9, 9:16, 1:1, 4:3.',
    what: 'The width×height of your video. 16:9 is landscape (YouTube), 9:16 is vertical (Reels/TikTok), 1:1 is square.',
    how: 'Pick a preset from the Canvas dropdown in the toolbar. Existing clips may need re-fitting (see Frame fit).',
  },
  {
    name: 'Zoom (timeline)',
    category: 'Timeline',
    tip: 'Stretch the timeline to see more/less detail.',
    what: 'Changes how many pixels each second of timeline takes, for finer or broader editing.',
    how: 'Drag the Zoom slider in the toolbar.',
  },
  {
    name: 'Export',
    category: 'Export',
    tip: 'Render the final video file (MP4/WebM).',
    what: 'Turns your project into a real video file you can share, with choices for resolution, quality and format.',
    how: 'Press Export, pick your settings, and confirm. The file downloads when done; you can cancel mid-way.',
  },
  {
    name: 'Save / Open project',
    category: 'Project',
    tip: 'Save the whole project (with media) to a file you can reopen.',
    what: 'Bundles the timeline AND your media into one file, so you can back up a project or move it to another computer. (This is different from Export, which makes a video.)',
    how: 'Press Save to download the project file, or Open to load one back. Your work also auto-saves in this browser.',
  },
];

/** Filter entries by a free-text query over name / category / text. */
export function searchGuide(query: string): GuideEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return GUIDE;
  return GUIDE.filter((e) =>
    `${e.name} ${e.category} ${e.tip} ${e.what} ${e.how}`.toLowerCase().includes(q),
  );
}
