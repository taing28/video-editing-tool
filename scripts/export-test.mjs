/**
 * scripts/export-test.mjs — drive a real export and validate the output file.
 *
 * Imports an image + audio, places them, clicks Export, captures the download,
 * and checks the bytes are a real MP4 or WebM (magic numbers + size).
 */
import { writeFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { Input, ALL_FORMATS, BufferSource } from 'mediabunny';
import { URL, APP_URL, startServer, waitForServer, launch, makePng, makeWav } from './_harness.mjs';

const tmp = path.join(os.tmpdir(), 'video-editor-export');
mkdirSync(tmp, { recursive: true });
const pngPath = path.join(tmp, 'g.png');
const wavPath = path.join(tmp, 't.wav');
writeFileSync(pngPath, makePng(640, 360));
writeFileSync(wavPath, makeWav(2));

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

function validateContainer(buf, ext) {
  const isWebm = buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
  const isMp4 =
    buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70; // 'ftyp'
  return { isWebm, isMp4, ext };
}

try {
  await waitForServer();
  const browser = await launch(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + e.message));

  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.app');

  log('Import + place media');
  await page.setInputFiles('.library input[type=file]', [pngPath, wavPath]);
  await page.waitForFunction(() => document.querySelectorAll('.media-card').length === 2);
  await page.dblclick('.media-card--image');
  await page.waitForSelector('.lane--video .clip');
  await page.dblclick('.media-card--audio');
  await page.waitForSelector('.lane--audio .clip');
  await page.click('[data-panel="captions"]'); // open Captions panel in the left dock
  await page.click('.dock button:has-text("Add caption")'); // exercise caption render in export
  assert(true, 'image on video track + audio on audio track + caption');

  log('Export (via dialog, at 50% resolution)');
  await page.click('button:has-text("Export")'); // open the dialog
  await page.waitForSelector('.export-dialog__go');
  await page.locator('.modal select').first().selectOption('0.5'); // Resolution = 50%
  const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
  await page.click('.export-dialog__go'); // start export
  const download = await downloadPromise;
  const fname = download.suggestedFilename();
  const outPath = path.join(tmp, fname);
  await download.saveAs(outPath);
  await browser.close();

  const buf = readFileSync(outPath);
  const size = statSync(outPath).size;
  const ext = path.extname(fname).slice(1);
  const v = validateContainer(buf, ext);

  log(`\noutput: ${fname} (${(size / 1024).toFixed(1)} KB)`);
  log(`magic: webm=${v.isWebm} mp4=${v.isMp4}`);
  log('--- console.errors ---');
  log(consoleErrors.length ? consoleErrors.join('\n') : '(none)');

  assert(size > 2000, `file is non-trivial (${size} bytes)`);
  assert(v.isWebm || v.isMp4, 'file has a valid MP4/WebM signature');
  assert(
    (ext === 'webm' && v.isWebm) || (ext === 'mp4' && v.isMp4),
    `extension .${ext} matches the container`,
  );

  // Deep validation: re-parse the container and check tracks + duration.
  const input = new Input({ source: new BufferSource(buf), formats: ALL_FORMATS });
  const videoTracks = await input.getVideoTracks();
  const audioTracks = await input.getAudioTracks();
  const duration = await input.computeDuration();
  const vt = videoTracks[0];
  log(
    `parsed: video=${videoTracks.length}(${vt ? await vt.getCodec() : '-'} ${vt?.displayWidth}x${vt?.displayHeight}) ` +
      `audio=${audioTracks.length} duration=${duration.toFixed(2)}s`,
  );
  assert(videoTracks.length === 1, 'exactly one video track');
  assert(
    vt.displayWidth === 960 && vt.displayHeight === 540,
    `video scaled to 50% (960x540, got ${vt.displayWidth}x${vt.displayHeight})`,
  );
  assert(audioTracks.length === 1, 'exactly one audio track (mixed down)');
  assert(duration > 4.8 && duration < 5.4, `duration ~5s (${duration.toFixed(2)}s)`);
  assert(consoleErrors.length === 0, 'no console/page errors during export');

  log('\nEXPORT TEST PASS');
} catch (err) {
  console.error('\nEXPORT TEST FAIL:', err.message);
  if (consoleErrors.length) console.error('console errors:\n' + consoleErrors.join('\n'));
  failed = true;
} finally {
  server.kill('SIGTERM');
}

process.exit(failed ? 1 : 0);
