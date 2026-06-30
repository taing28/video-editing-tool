/**
 * scripts/persist-test.mjs — verify autosave/restore.
 *
 * Imports media + adds a clip + text, waits for autosave, then RELOADS the page
 * and asserts the project (clips, media, text) came back from IndexedDB.
 * Uses the real URL (persistence ON); starts by clearing storage for a clean base.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { URL, startServer, waitForServer, launch, makePng, makeWav } from './_harness.mjs';

const tmp = path.join(os.tmpdir(), 'video-editor-persist');
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

try {
  await waitForServer();
  const browser = await launch(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + e.message));

  // Clean slate.
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.deleteDatabase('video-editor');
        r.onsuccess = r.onerror = r.onblocked = () => res();
      }),
  );

  log('build a project: import + clip + text');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.app');
  await page.setInputFiles('.library input[type=file]', [pngPath, wavPath]);
  await page.waitForFunction(() => document.querySelectorAll('.media-card').length === 2);
  await page.dblclick('.media-card--image');
  await page.waitForSelector('.lane--video .clip');
  await page.dblclick('.media-card--audio');
  await page.waitForSelector('.lane--audio .clip');
  await page.click('button:has-text("Add text")');
  await page.waitForSelector('.inspector textarea');
  await page.fill('.inspector textarea', 'Persisted!');

  const before = await page.evaluate(() => {
    const p = window.__editor.getState().project;
    return {
      clips: Object.keys(p.clips).length,
      media: Object.keys(p.media).length,
      effects: Object.keys(p.effects).length,
    };
  });
  assert(before.clips === 2 && before.media === 2 && before.effects === 1, 'project built');

  log('wait for autosave, then RELOAD');
  await page.waitForTimeout(900); // debounce is 500ms
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.lane--video .clip', { timeout: 8000 });

  const after = await page.evaluate(() => {
    const p = window.__editor.getState().project;
    const text = Object.values(p.effects).find((e) => e.type === 'text');
    return {
      clips: Object.keys(p.clips).length,
      media: Object.keys(p.media).length,
      effects: Object.keys(p.effects).length,
      text: text?.text,
    };
  });
  log(`after reload: ${JSON.stringify(after)}`);
  assert(after.clips === before.clips, `clips persisted (${after.clips})`);
  assert(after.media === before.media, `media persisted (${after.media})`);
  assert(after.effects === before.effects, `effects persisted (${after.effects})`);
  assert(after.text === 'Persisted!', 'text content persisted');
  // media must be usable again (the image clip renders) — preview not all black
  await page.waitForTimeout(300);
  const lum = await page.evaluate(() => {
    const c = document.querySelector('.preview canvas');
    if (!c) return -1;
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    return s;
  });
  assert(lum > 100000, `restored media renders in preview (lum=${lum})`);

  await browser.close();
  log('--- console.errors ---');
  log(consoleErrors.length ? consoleErrors.join('\n') : '(none)');
  assert(consoleErrors.length === 0, 'no console/page errors');

  log('\nPERSIST TEST PASS');
} catch (err) {
  console.error('\nPERSIST TEST FAIL:', err.message);
  if (consoleErrors.length) console.error('console errors:\n' + consoleErrors.join('\n'));
  failed = true;
} finally {
  server.kill('SIGTERM');
}

process.exit(failed ? 1 : 0);
