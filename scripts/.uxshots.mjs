/**
 * scripts/.uxshots.mjs — TEMPORARY UX audit probe (not part of verify).
 * Boots the app, builds a realistic project, screenshots every major UI state.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { APP_URL, startServer, waitForServer, launch, makePng, makeWav } from './_harness.mjs';

const OUT = process.argv[2] || 'scripts/.uxshots';
mkdirSync(OUT, { recursive: true });

const tmp = path.join(os.tmpdir(), 'video-editor-uxshots');
mkdirSync(tmp, { recursive: true });
const pngPath = path.join(tmp, 'gradient.png');
const png2Path = path.join(tmp, 'gradient2.png');
const wavPath = path.join(tmp, 'tone.wav');
writeFileSync(pngPath, makePng(640, 360));
writeFileSync(png2Path, makePng(320, 480));
writeFileSync(wavPath, makeWav(4));

const server = startServer();
const errors = [];
let n = 0;
async function shot(page, name) {
  n += 1;
  const file = path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`shot: ${file}`);
}

async function dragFromTo(page, fromSel, toSel) {
  const from = await page.locator(fromSel).boundingBox();
  const to = await page.locator(toSel).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 6);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
}

try {
  await waitForServer();
  const browser = await launch(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.app');
  await shot(page, 'empty-app');

  // media imported
  await page.setInputFiles('.library input[type=file]', [pngPath, png2Path, wavPath]);
  await page.waitForTimeout(600);
  await shot(page, 'media-imported');

  // clips on tracks (double-click adds)
  await page.dblclick('.media-card--image >> nth=0');
  await page.dblclick('.media-card--audio >> nth=0');
  await page.waitForTimeout(400);
  await shot(page, 'clips-on-timeline');

  // select the image clip -> inspector
  await page.click('.lane--video .clip >> nth=0');
  await page.waitForTimeout(200);
  await shot(page, 'image-clip-selected');

  // audio clip selected
  await page.click('.lane--audio .clip >> nth=0');
  await page.waitForTimeout(200);
  await shot(page, 'audio-clip-selected');

  // text panel + add text
  await page.click('[data-panel="text"]');
  await page.waitForTimeout(200);
  await shot(page, 'dock-text-panel');
  await page.click('.dock button:has-text("Add text")');
  await page.waitForTimeout(300);
  await shot(page, 'text-added-inspector');

  // captions panel + add caption
  await page.click('[data-panel="captions"]');
  await page.waitForTimeout(200);
  await shot(page, 'dock-captions-panel');
  await page.click('.dock button:has-text("Add caption")');
  await page.waitForTimeout(300);
  await shot(page, 'caption-added');

  // elements panel + shape
  await page.click('[data-panel="elements"]');
  await page.waitForTimeout(200);
  await shot(page, 'dock-elements-panel');
  await page.click('.dock button:has-text("Shape")');
  await page.waitForTimeout(300);
  await shot(page, 'shape-added');

  // adjust panel with image clip selected
  await page.click('.lane--video .clip >> nth=0');
  await page.click('[data-panel="adjust"]');
  await page.waitForTimeout(200);
  await shot(page, 'dock-adjust-panel');

  // settings panel
  await page.click('[data-panel="settings"]');
  await page.waitForTimeout(200);
  await shot(page, 'dock-settings-panel');

  // timeline with overlay lanes, nothing selected
  await page.keyboard.press('Escape');
  await page.click('.preview', { position: { x: 10, y: 10 } }).catch(() => {});
  await page.waitForTimeout(200);
  await shot(page, 'timeline-overlay-lanes');

  // playing state
  await page.click('.iconbtn--play');
  await page.waitForTimeout(700);
  await shot(page, 'playing');
  await page.click('.iconbtn--play');

  // export dialog
  await page.click('.header button:has-text("Export")');
  await page.waitForTimeout(300);
  await shot(page, 'export-dialog');
  await page.click('.modal__actions button:has-text("Cancel")');
  await page.waitForTimeout(200);

  // help dialog
  await page.click('.help-btn');
  await page.waitForTimeout(300);
  await shot(page, 'help-dialog');
  await page.keyboard.press('Escape');

  // media panel back open (default working state)
  await page.click('[data-panel="media"]');
  await page.waitForTimeout(200);
  await shot(page, 'media-panel-final');

  // small laptop viewport
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(400);
  await shot(page, 'small-viewport-1280');

  // narrow viewport
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.waitForTimeout(400);
  await shot(page, 'narrow-viewport-1024');

  console.log('--- console/page errors ---');
  console.log(errors.length ? errors.join('\n') : '(none)');
  await browser.close();
} finally {
  server.kill();
}
