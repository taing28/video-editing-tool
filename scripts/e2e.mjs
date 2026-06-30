/**
 * scripts/e2e.mjs — drive the real app through the full editing loop and assert
 * behavior. Fails on the FIRST broken assertion or ANY console/page error.
 *
 *   node scripts/e2e.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  APP_URL,
  startServer,
  waitForServer,
  launch,
  makePng,
  makeWav,
} from './_harness.mjs';

const tmp = path.join(os.tmpdir(), 'video-editor-e2e');
mkdirSync(tmp, { recursive: true });
const pngPath = path.join(tmp, 'gradient.png');
const wavPath = path.join(tmp, 'tone.wav');
writeFileSync(pngPath, makePng(640, 360));
writeFileSync(wavPath, makeWav(2));

const SHOT = process.argv.includes('--shot')
  ? process.argv[process.argv.indexOf('--shot') + 1]
  : 'scripts/.e2e.png';

const server = startServer();
const consoleErrors = [];
const pageErrors = [];
let failed = false;
const log = (m) => console.log(m);

function assert(cond, msg) {
  if (cond) {
    log(`  ✓ ${msg}`);
  } else {
    log(`  ✗ ${msg}`);
    failed = true;
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function clipCount(page, lane) {
  return page.locator(`.lane--${lane} .clip`).count();
}

async function dragBy(page, sel, dx, dy) {
  const b = await page.locator(sel).boundingBox();
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + Math.sign(dx) * 8, cy); // pass activation threshold
  await page.mouse.move(cx + dx, cy + dy, { steps: 10 });
  await page.mouse.up();
}

// Total RGB across all preview canvases (a selected clip paints on the
// interaction layer, so sum every layer canvas).
const previewLum = (page) =>
  page.evaluate(() => {
    let sum = 0;
    for (const c of document.querySelectorAll('.preview canvas')) {
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) continue;
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
    }
    return sum;
  });

const setBrightness = (page, v) =>
  page.locator('.inspector__sub input[type=range]').first().evaluate((el, val) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);

async function dragFromTo(page, fromSel, toSel) {
  const from = await page.locator(fromSel).boundingBox();
  const to = await page.locator(toSel).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // exceed dnd-kit activation distance, then glide to the target
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 6);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
}

try {
  await waitForServer();
  const browser = await launch(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.app');
  log('STEP 1 — app loads');
  assert(await page.locator('.toolbar').count() === 1, 'toolbar present');
  assert(await page.locator('.lane').count() === 2, 'video + audio lanes present');

  log('STEP 2 — import image + audio');
  await page.setInputFiles('input[type=file]', [pngPath, wavPath]);
  await page.waitForSelector('.media-card');
  await page.waitForFunction(() => document.querySelectorAll('.media-card').length === 2);
  assert(await page.locator('.media-card').count() === 2, 'two media cards appear');
  assert(await page.locator('.media-card--image').count() === 1, 'image card present');
  assert(await page.locator('.media-card--audio').count() === 1, 'audio card present');

  log('STEP 3 — add image to video track (double-click)');
  await page.dblclick('.media-card--image');
  await page.waitForSelector('.lane--video .clip');
  assert((await clipCount(page, 'video')) === 1, 'one clip on the video track');
  const w1 = await page.$eval('.lane--video .clip', (el) => el.getBoundingClientRect().width);
  assert(w1 > 0, `clip has width (${Math.round(w1)}px)`);

  log('STEP 3a — color grading actually changes preview pixels');
  // Clean state: one full-frame image, opacity 1. Grade up → brighter; down → darker.
  await page.waitForSelector('.inspector__sub');
  const lumBase = await previewLum(page);
  await setBrightness(page, '1.5');
  await page.waitForTimeout(140); // Konva redraws on the new filtered-canvas image
  const lumUp = await previewLum(page);
  assert(lumUp > lumBase * 1.05, `brightness 1.5 brightens preview (${lumBase} -> ${lumUp})`);
  await setBrightness(page, '0.5');
  await page.waitForTimeout(140);
  const lumDown = await previewLum(page);
  assert(lumDown < lumBase * 0.95, `brightness 0.5 darkens preview (${lumBase} -> ${lumDown})`);
  await setBrightness(page, '1'); // reset so later visual steps are unaffected
  await page.waitForTimeout(80);

  log('STEP 3b — clip opacity via inspector');
  // First range = Opacity (the color-grading sliders live under .inspector__sub).
  await page.locator('.inspector input[type=range]').first().evaluate((el) => {
    // React tracks input values; use the native setter so onChange fires.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '0.5');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const opacity = await page.evaluate(() => {
    const ed = window.__editor.getState();
    return ed.project.clips[ed.selectedClipId].transform.opacity;
  });
  assert(Math.abs(opacity - 0.5) < 0.06, `opacity set via inspector (${opacity})`);

  log('STEP 4 — trim right edge shorter (controlled −150px)');
  await dragBy(page, '.lane--video .clip .clip__handle--r', -150, 0);
  const w2 = await page.$eval('.lane--video .clip', (el) => el.getBoundingClientRect().width);
  assert(w2 < w1 && w2 > 300, `clip partially shortened, not collapsed (${Math.round(w1)} -> ${Math.round(w2)})`);

  log('STEP 5 — drag audio card onto audio track (real dnd-kit drag)');
  await dragFromTo(page, '.media-card--audio', '.lane--audio .lane__area');
  await page.waitForSelector('.lane--audio .clip', { timeout: 4000 });
  assert((await clipCount(page, 'audio')) === 1, 'one clip on the audio track via drag');
  await page.waitForSelector('.lane--audio .clip canvas.waveform', { timeout: 4000 });
  assert(
    (await page.locator('.lane--audio .clip canvas.waveform').count()) >= 1,
    'audio clip shows a waveform',
  );

  log('STEP 5b — audio volume + fade (clip is selected after the drop)');
  const setInput = (sel, val) =>
    page.locator(sel).evaluate((el, v) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, val);
  await setInput('.inspector input[type=range]', '1.5'); // Volume
  const gain = await page.evaluate(() => {
    const ed = window.__editor.getState();
    return ed.project.clips[ed.selectedClipId].gain;
  });
  assert(Math.abs(gain - 1.5) < 0.06, `volume set via inspector (${gain})`);
  await page.locator('.inspector input[type=number]').first().evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '0.5');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const fadeIn = await page.evaluate(() => {
    const ed = window.__editor.getState();
    return ed.project.clips[ed.selectedClipId].fadeInFrames;
  });
  assert(fadeIn >= 12 && fadeIn <= 18, `fade-in ~15 frames (got ${fadeIn})`);

  log('STEP 5c — clip speed (2× halves the clip on the timeline)');
  const durBefore = await page.evaluate(() => {
    const ed = window.__editor.getState();
    return ed.project.clips[ed.selectedClipId].durationInFrames;
  });
  await page.locator('.inspector select').selectOption('2');
  const sped = await page.evaluate(() => {
    const ed = window.__editor.getState();
    const c = ed.project.clips[ed.selectedClipId];
    return { dur: c.durationInFrames, speed: c.speed };
  });
  assert(sped.speed === 2, `speed set to 2× (${sped.speed})`);
  assert(sped.dur === Math.round(durBefore / 2), `2× halved duration (${durBefore} -> ${sped.dur})`);

  log('STEP 5d — duck under voice');
  await page.locator('.inspector input[type=checkbox]').check();
  assert(
    await page.evaluate(() => {
      const ed = window.__editor.getState();
      return ed.project.clips[ed.selectedClipId].duck;
    }),
    'audio clip set to duck under voice',
  );

  log('STEP 6 — select + split at playhead');
  await page.click('.lane--video .clip');
  await page.click('.ruler', { position: { x: 150, y: 12 } }); // scrub into the clip
  await page.click('button:has-text("Split")');
  await page.waitForFunction(() => document.querySelectorAll('.lane--video .clip').length === 2);
  assert((await clipCount(page, 'video')) === 2, 'split produced two video clips');

  log('STEP 7 — undo / redo');
  await page.click('button:has-text("Undo")'); // undo split
  assert((await clipCount(page, 'video')) === 1, 'undo reverted the split');
  await page.click('button:has-text("Redo")'); // redo split
  assert((await clipCount(page, 'video')) === 2, 'redo re-applied the split');

  log('STEP 8 — add text overlay + edit');
  await page.click('button:has-text("Add text")');
  await page.waitForSelector('.inspector textarea');
  assert((await page.locator('.inspector textarea').count()) === 1, 'text inspector opened');
  await page.fill('.inspector textarea', 'Hello world');
  assert((await page.inputValue('.inspector textarea')) === 'Hello world', 'text edits apply');

  log('STEP 8b — drag the text overlay on the preview to move it');
  const beforeX = await page.evaluate(() => {
    const ed = window.__editor.getState();
    return ed.project.effects[ed.selectedEffectId].x;
  });
  const grab = await page.evaluate(() => {
    const ed = window.__editor.getState();
    const eff = ed.project.effects[ed.selectedEffectId];
    const r = document.querySelector('.preview canvas').getBoundingClientRect();
    const s = r.width / ed.project.width;
    return { x: r.left + eff.x * s + 16, y: r.top + eff.y * s + 14 };
  });
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 80, grab.y + 24, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const afterX = await page.evaluate(() => {
    const ed = window.__editor.getState();
    return ed.project.effects[ed.selectedEffectId].x;
  });
  assert(afterX > beforeX + 5, `text moved right after drag (${beforeX} -> ${afterX})`);

  log('STEP 9 — scrub moves playhead');
  const tc0 = await page.textContent('.toolbar__time');
  await page.click('.ruler', { position: { x: 200, y: 12 } });
  const tc1 = await page.textContent('.toolbar__time');
  assert(tc1 !== tc0, `timecode changed on scrub (${tc0} -> ${tc1})`);

  log('STEP 10 — play advances, pause stops');
  await page.click('button:has-text("Play")');
  await page.waitForTimeout(500);
  const tcPlaying = await page.textContent('.toolbar__time');
  await page.click('button:has-text("Pause")');
  assert(tcPlaying !== tc1, `playhead advanced while playing (${tc1} -> ${tcPlaying})`);
  const tcAfterPause = await page.textContent('.toolbar__time');
  await page.waitForTimeout(300);
  assert((await page.textContent('.toolbar__time')) === tcAfterPause, 'playhead frozen after pause');

  log('STEP 11 — multi-track: add an audio track');
  const lanesBefore = await page.locator('.lane').count();
  await page.click('button:has-text("+ Audio")');
  await page.waitForFunction((n) => document.querySelectorAll('.lane').length === n, lanesBefore + 1);
  assert(
    (await page.locator('.lane').count()) === lanesBefore + 1,
    `audio track added (${lanesBefore} -> ${lanesBefore + 1} lanes)`,
  );

  log('STEP 12 — aspect-ratio preset 9:16');
  await page.selectOption('.toolbar__select', '1080x1920');
  await page.waitForFunction(
    () => document.querySelector('.toolbar__select')?.value === '1080x1920',
  );
  assert(
    (await page.inputValue('.toolbar__select')) === '1080x1920',
    'canvas switched to 9:16 (1080x1920)',
  );

  log('STEP 13 — project background color');
  await page.evaluate(() => window.__editor.getState().selectClip(null));
  await page.waitForSelector('.inspector input[type=color]');
  await page.locator('.inspector input[type=color]').evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '#3366ff');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const bg = await page.evaluate(() => window.__editor.getState().project.background);
  assert(bg === '#3366ff', `background color set (${bg})`);

  log('STEP 13b — add + edit a caption');
  await page.click('button:has-text("CC Caption")');
  const capId = await page.evaluate(() => window.__editor.getState().selectedEffectId);
  assert(
    await page.evaluate(
      (id) => window.__editor.getState().project.effects[id]?.type === 'caption',
      capId,
    ),
    'caption effect added + selected',
  );
  await page.waitForSelector('.inspector textarea');
  await page.fill('.inspector textarea', 'Hello captions');
  assert(
    (await page.evaluate((id) => window.__editor.getState().project.effects[id].text, capId)) ===
      'Hello captions',
    'caption text edits apply',
  );

  log('STEP 13c — overlays list re-selects an overlay');
  await page.evaluate(() => window.__editor.getState().selectClip(null)); // deselect
  await page.waitForSelector('.overlays__select');
  assert(
    (await page.locator('.overlays__select').count()) >= 2,
    'overlays list shows the text + caption',
  );
  await page.locator('.overlays__select').first().click();
  assert(
    (await page.evaluate(() => window.__editor.getState().selectedEffectId)) != null,
    'clicking an overlay selects it',
  );

  log('STEP 13d — auto-captions (mocked on-device transcriber)');
  await page.evaluate(() => {
    window.__transcribeOverride = async () => [
      { text: 'auto one', start: 0, end: 1 },
      { text: 'auto two', start: 1, end: 2 },
    ];
  });
  const captionCount = () =>
    page.evaluate(
      () =>
        Object.values(window.__editor.getState().project.effects).filter(
          (e) => e.type === 'caption',
        ).length,
    );
  const capsBefore = await captionCount();
  await page.click('button:has-text("Auto-caption")');
  await page.waitForFunction(
    (n) =>
      Object.values(window.__editor.getState().project.effects).filter((e) => e.type === 'caption')
        .length >= n,
    capsBefore + 2,
  );
  assert((await captionCount()) === capsBefore + 2, `auto-captions added 2 (was ${capsBefore})`);
  assert(
    await page.evaluate(() =>
      Object.values(window.__editor.getState().project.effects).some((e) => e.text === 'auto one'),
    ),
    'transcribed caption text inserted',
  );

  log('STEP 13e — shape overlay + drag on the preview');
  await page.click('button:has-text("Shape")');
  const shapeId = await page.evaluate(() => window.__editor.getState().selectedEffectId);
  assert(
    await page.evaluate(
      (id) => window.__editor.getState().project.effects[id]?.type === 'shape',
      shapeId,
    ),
    'shape effect added + selected',
  );
  const shapeXBefore = await page.evaluate(
    (id) => window.__editor.getState().project.effects[id].x,
    shapeId,
  );
  const shapeGrab = await page.evaluate((id) => {
    const ed = window.__editor.getState();
    const sh = ed.project.effects[id];
    const r = document.querySelector('.preview canvas').getBoundingClientRect();
    const s = r.width / ed.project.width;
    return { x: r.left + (sh.x + sh.width / 2) * s, y: r.top + (sh.y + sh.height / 2) * s };
  }, shapeId);
  await page.mouse.move(shapeGrab.x, shapeGrab.y);
  await page.mouse.down();
  await page.mouse.move(shapeGrab.x + 60, shapeGrab.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const shapeXAfter = await page.evaluate(
    (id) => window.__editor.getState().project.effects[id].x,
    shapeId,
  );
  assert(shapeXAfter > shapeXBefore + 5, `shape dragged right (${shapeXBefore} -> ${shapeXAfter})`);

  log('STEP 13f — lower third adds a shape + text together');
  const effBefore = await page.evaluate(
    () => Object.keys(window.__editor.getState().project.effects).length,
  );
  await page.click('button:has-text("Lower third")');
  const effAfter = await page.evaluate(
    () => Object.keys(window.__editor.getState().project.effects).length,
  );
  assert(effAfter === effBefore + 2, `lower third added a shape + text (${effBefore} -> ${effAfter})`);

  log('STEP 14 — transition between the two video clips (overlap + wipe style)');
  await page.locator('.lane--video .clip').nth(1).click(); // select the 2nd (later) clip
  await page.waitForSelector('button:has-text("Add transition")');
  await page.click('button:has-text("Add transition")');
  const overlap = await page.evaluate(() => {
    const p = window.__editor.getState().project;
    const vids = Object.values(p.clips)
      .filter((c) => c.kind !== 'audio')
      .sort((a, b) => a.startFrame - b.startFrame);
    if (vids.length < 2) return -1;
    return vids[0].startFrame + vids[0].durationInFrames - vids[1].startFrame; // overlap frames
  });
  assert(overlap > 0, `clips now overlap for a transition (${overlap}f)`);
  // image clip inspector selects: [Motion, Transition]
  await page.locator('.inspector select').nth(1).selectOption('wipe'); // Transition
  assert(
    (await page.evaluate(() => {
      const ed = window.__editor.getState();
      return ed.project.clips[ed.selectedClipId].transition;
    })) === 'wipe',
    'transition style set to wipe',
  );
  await page.locator('.inspector select').nth(0).selectOption('zoomIn'); // Ken Burns motion
  assert(
    (await page.evaluate(() => {
      const ed = window.__editor.getState();
      return ed.project.clips[ed.selectedClipId].motion;
    })) === 'zoomIn',
    'Ken Burns motion set to zoom in',
  );

  log('STEP 14b — color grading (image clip): brightness slider + B&W preset');
  // The 2nd video clip (an image) is still selected from STEP 14.
  await page.waitForSelector('.inspector__sub'); // the Color section
  await page.locator('.inspector__sub input[type=range]').first().evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '1.5');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert(
    Math.abs(
      (await page.evaluate(() => {
        const ed = window.__editor.getState();
        return ed.project.clips[ed.selectedClipId].adjust.brightness;
      })) - 1.5,
    ) < 0.06,
    'brightness set via inspector slider',
  );
  await page.click('.inspector__sub button:has-text("B&W")');
  assert(
    (await page.evaluate(() => {
      const ed = window.__editor.getState();
      return ed.project.clips[ed.selectedClipId].adjust.saturate;
    })) === 0,
    'B&W preset zeroes saturation',
  );
  // The preview must render the graded clip without error (asserted globally).
  await page.waitForTimeout(80);

  log('STEP 14c — frame fit: Fill (cover) overflows, Fit (contain) letterboxes');
  // The selected image (640×360) sits in a 1080×1920 canvas (set in STEP 12).
  const fitState = () =>
    page.evaluate(() => {
      const ed = window.__editor.getState();
      const t = ed.project.clips[ed.selectedClipId].transform;
      return { w: t.width, h: t.height, cw: ed.project.width, ch: ed.project.height };
    });
  await page.click('.inspector button:has-text("Fill")');
  const filled = await fitState();
  assert(
    filled.w > filled.cw,
    `Fill covers + overflows the frame (w=${Math.round(filled.w)} > ${filled.cw})`,
  );
  await page.click('.inspector button:has-text("Fit")');
  const fitted = await fitState();
  assert(
    Math.abs(fitted.w - fitted.cw) < 1 && fitted.h < fitted.ch,
    `Fit contains to width + letterboxes (w=${Math.round(fitted.w)}≈${fitted.cw}, h=${Math.round(fitted.h)}<${fitted.ch})`,
  );

  log('STEP 15 — filmstrip thumbnails on clips');
  await page.waitForSelector('.lane--video .clip .filmstrip__tile', { timeout: 5000 });
  assert(
    (await page.locator('.lane--video .clip .filmstrip__tile').count()) >= 1,
    'video clip shows filmstrip thumbnails',
  );

  log('STEP 16 — editable project name');
  await page.locator('.toolbar__name').evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, 'My Reel');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert(
    (await page.evaluate(() => window.__editor.getState().project.name)) === 'My Reel',
    'project renamed',
  );

  log('STEP 17 — fps change (project inspector)');
  await page.evaluate(() => window.__editor.getState().selectClip(null));
  await page.waitForSelector('.inspector select');
  await page.selectOption('.inspector select', '60');
  assert(
    (await page.evaluate(() => window.__editor.getState().project.fps)) === 60,
    'fps set to 60',
  );

  log('STEP 18 — snapping toggle');
  const snapBefore = await page.evaluate(() => window.__editor.getState().snappingEnabled);
  await page.click('.tl-toggle');
  assert(
    (await page.evaluate(() => window.__editor.getState().snappingEnabled)) === !snapBefore,
    `snapping toggled (${snapBefore} -> ${!snapBefore})`,
  );

  log('STEP 19 — mute audio track / hide video track');
  await page.locator('.lane--audio .lane__toggle').first().click();
  await page.locator('.lane--video .lane__toggle').first().click();
  const flags = await page.evaluate(() => {
    const t = Object.values(window.__editor.getState().project.tracks);
    return {
      muted: t.some((x) => x.kind === 'audio' && x.muted),
      hidden: t.some((x) => x.kind === 'video' && x.hidden),
    };
  });
  assert(flags.muted, 'an audio track is muted');
  assert(flags.hidden, 'a video track is hidden');

  log('STEP 19b — export dialog opens and closes');
  await page.click('button:has-text("Export")');
  await page.waitForSelector('.export-dialog__go');
  assert((await page.locator('.modal').count()) === 1, 'export dialog opened');
  await page.click('.modal .btn >> text=Cancel');
  await page.waitForSelector('.modal', { state: 'detached' });
  assert((await page.locator('.modal').count()) === 0, 'export dialog closed');

  await page.screenshot({ path: SHOT });

  log('STEP 20 — delete media removes its clips');
  const beforeMedia = await page.evaluate(
    () => Object.keys(window.__editor.getState().project.media).length,
  );
  const beforeVclips = await page.locator('.lane--video .clip').count();
  await page.locator('.media-card--image').hover();
  await page.locator('.media-card--image .media-card__delete').click();
  const afterMedia = await page.evaluate(
    () => Object.keys(window.__editor.getState().project.media).length,
  );
  assert(afterMedia === beforeMedia - 1, `media removed (${beforeMedia} -> ${afterMedia})`);
  assert(
    (await page.locator('.lane--video .clip').count()) < beforeVclips,
    'image clips removed with the media',
  );

  await browser.close();

  log('\n--- console.errors ---');
  log(consoleErrors.length ? consoleErrors.join('\n') : '(none)');
  log('--- pageerrors ---');
  log(pageErrors.length ? pageErrors.join('\n') : '(none)');
  assert(consoleErrors.length === 0, 'no console errors during the whole flow');
  assert(pageErrors.length === 0, 'no uncaught page errors during the whole flow');

  log(`\nscreenshot: ${SHOT}`);
  log('\nE2E PASS');
} catch (err) {
  console.error('\nE2E FAIL:', err.message);
  if (consoleErrors.length) console.error('console errors:\n' + consoleErrors.join('\n'));
  if (pageErrors.length) console.error('page errors:\n' + pageErrors.join('\n'));
  failed = true;
} finally {
  server.kill('SIGTERM');
}

process.exit(failed ? 1 : 0);
