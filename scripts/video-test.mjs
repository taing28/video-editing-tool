/**
 * scripts/video-test.mjs — exercise the VIDEO-clip path end to end.
 *
 * No external video fixtures: Phase A uses the app's own export to produce a
 * short MP4, Phase B re-imports that MP4 as a *video clip*, scrubs it (checking
 * the preview actually paints a non-black frame), and re-exports — proving
 * decode → preview → frame-accurate export all work.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { Input, ALL_FORMATS, BufferSource } from 'mediabunny';
import { URL, APP_URL, startServer, waitForServer, launch, makePng } from './_harness.mjs';

const tmp = path.join(os.tmpdir(), 'video-editor-videotest');
mkdirSync(tmp, { recursive: true });
const pngPath = path.join(tmp, 'g.png');
writeFileSync(pngPath, makePng(640, 360));

const server = startServer();
const consoleErrors = [];
let failed = false;
const log = (m) => console.log(m);
function assert(cond, msg) {
  log(`  ${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) {
    failed = true;
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function exportAndSave(page, outPath) {
  await page.click('button:has-text("Export")'); // open dialog
  await page.waitForSelector('.export-dialog__go');
  const dl = page.waitForEvent('download', { timeout: 90000 });
  await page.click('.export-dialog__go'); // start export
  const download = await dl;
  await download.saveAs(outPath);
}

try {
  await waitForServer();
  const browser = await launch(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + e.message));

  // --- Phase A: build a short MP4 fixture using the app's own export ---
  log('PHASE A — generate a video fixture via export');
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.app');
  await page.setInputFiles('input[type=file]', [pngPath]);
  await page.waitForSelector('.media-card--image');
  await page.dblclick('.media-card--image');
  await page.waitForSelector('.lane--video .clip');
  // shorten to ~1s so the test is fast
  await page.fill('.inspector input[type=number]', '1');
  const fixture = path.join(tmp, 'fixture.mp4');
  await exportAndSave(page, fixture);
  assert(readFileSync(fixture).length > 2000, 'fixture MP4 generated');

  // --- Phase B: import that MP4 as a VIDEO clip and test it ---
  log('PHASE B — import the MP4 as a video clip');
  await page.goto(APP_URL, { waitUntil: 'networkidle' }); // reset app state
  await page.waitForSelector('.app');
  await page.setInputFiles('input[type=file]', [fixture]);
  await page.waitForSelector('.media-card--video');
  assert((await page.locator('.media-card--video').count()) === 1, 'video appears in media library');

  await page.dblclick('.media-card--video');
  await page.waitForSelector('.lane--video .clip');
  assert((await page.locator('.lane--video .clip').count()) === 1, 'video clip added to video track');

  log('scrub + check the preview paints a real frame');
  await page.click('.ruler', { position: { x: 120, y: 12 } });
  await page.waitForTimeout(700); // allow <video> seek + layer redraw
  const luminance = await page.evaluate(() => {
    // Sum across all layer canvases (a selected clip renders on the interaction layer).
    let sum = 0;
    for (const c of document.querySelectorAll('.preview canvas')) {
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) continue;
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
    }
    return sum;
  });
  assert(luminance > 100000, `preview shows a non-black video frame (lum=${luminance})`);

  log('re-export the video project');
  const out = path.join(tmp, 'out.mp4');
  await exportAndSave(page, out);
  const buf = readFileSync(out);
  const input = new Input({ source: new BufferSource(buf), formats: ALL_FORMATS });
  const videoTracks = await input.getVideoTracks();
  const duration = await input.computeDuration();
  log(`re-exported: video=${videoTracks.length} duration=${duration.toFixed(2)}s`);
  assert(videoTracks.length === 1, 're-export has a video track');
  assert(duration > 0.6 && duration < 1.6, `re-export duration ~1s (${duration.toFixed(2)}s)`);

  await browser.close();
  log('--- console.errors ---');
  log(consoleErrors.length ? consoleErrors.join('\n') : '(none)');
  assert(consoleErrors.length === 0, 'no console/page errors throughout');

  log('\nVIDEO TEST PASS');
} catch (err) {
  console.error('\nVIDEO TEST FAIL:', err.message);
  if (consoleErrors.length) console.error('console errors:\n' + consoleErrors.join('\n'));
  failed = true;
} finally {
  server.kill('SIGTERM');
}

process.exit(failed ? 1 : 0);
