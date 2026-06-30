/**
 * scripts/caption-smoke.mjs — OPTIONAL real-model smoke for auto-captions.
 *
 * Runs the ACTUAL on-device Whisper path (no mock): imports audio, clicks
 * Auto-caption, and waits for transcription to complete without a page crash.
 * Slow (downloads ~60 MB) and not part of `npm run verify`. A sine tone has no
 * speech, so "no captions" is a valid pass — we're proving the pipeline loads
 * and runs end to end.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import { APP_URL, startServer, waitForServer, launch, makeWav } from './_harness.mjs';

const tmp = path.join(os.tmpdir(), 'video-editor-captionsmoke');
mkdirSync(tmp, { recursive: true });
const wavPath = path.join(tmp, 'tone.wav');
writeFileSync(wavPath, makeWav(2));

const server = startServer();
const pageErrors = [];
const consoleErrors = [];
let failed = false;
const log = (m) => console.log(m);

try {
  await waitForServer();
  const browser = await launch(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('dialog', (d) => d.dismiss().catch(() => {})); // auto-dismiss "no speech" alert

  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.app');
  await page.setInputFiles('.library input[type=file]', [wavPath]);
  await page.waitForSelector('.media-card--audio');
  await page.dblclick('.media-card--audio');
  await page.waitForSelector('.lane--audio .clip');

  log('Clicking Auto-caption (real Whisper — downloading model, please wait)…');
  await page.click('button:has-text("Auto-caption")');

  const deadline = Date.now() + 220_000;
  let done = false;
  let lastStatus = '';
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => {
      const st = window.__editor.getState();
      return {
        transcribing: st.isTranscribing,
        status: st.transcribeStatus,
        captions: Object.values(st.project.effects).filter((e) => e.type === 'caption').length,
      };
    });
    if (s.status && s.status !== lastStatus) {
      lastStatus = s.status;
      log(`  status: ${s.status}`);
    }
    if (!s.transcribing) {
      done = true;
      log(`  finished — captions produced: ${s.captions}`);
      break;
    }
    await sleep(3000);
  }

  await browser.close();
  const transcribeErrors = [...pageErrors, ...consoleErrors].filter(
    (m) => /auto-caption failed|create a session|onnx|wasm|model/i.test(m),
  );
  log('--- errors ---');
  log(transcribeErrors.length ? transcribeErrors.join('\n') : '(none)');
  if (!done) {
    console.error('SMOKE: transcription did not finish within the timeout');
    failed = true;
  } else if (transcribeErrors.length) {
    console.error('SMOKE: the model/transcription errored');
    failed = true;
  } else {
    log('\nCAPTION SMOKE PASS (real Whisper pipeline loaded + ran end to end)');
  }
} catch (err) {
  console.error('CAPTION SMOKE ERROR:', err.message);
  failed = true;
} finally {
  server.kill('SIGTERM');
}

process.exit(failed ? 1 : 0);
