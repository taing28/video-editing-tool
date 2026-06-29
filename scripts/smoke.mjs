/**
 * scripts/smoke.mjs — real-browser smoke test.
 *
 * Boots the Vite dev server, loads the app in headless Chromium, captures any
 * uncaught errors / console errors, verifies the editor UI actually rendered,
 * and writes a screenshot. Exit code is non-zero on any failure.
 *
 *   node scripts/smoke.mjs [--headed] [--shot <path>]
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const PORT = 4188;
const URL = `http://localhost:${PORT}/`;
const shotArgIdx = process.argv.indexOf('--shot');
const SHOT = shotArgIdx !== -1 ? process.argv[shotArgIdx + 1] : 'scripts/.smoke.png';

function startServer() {
  const proc = spawn(
    'npx',
    ['vite', '--port', String(PORT), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  proc.stdout.on('data', () => {});
  proc.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  return proc;
}

async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(URL);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await sleep(300);
  }
  throw new Error('Vite server did not start in time');
}

const server = startServer();
let exitCode = 0;
const pageErrors = [];
const consoleErrors = [];

try {
  await waitForServer();
  const launchOpts = { headless: !process.argv.includes('--headed') };
  if (process.env.PW_EXECUTABLE) launchOpts.executablePath = process.env.PW_EXECUTABLE;
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(1200); // let effects/ResizeObserver settle

  const ui = await page.evaluate(() => ({
    rootChildren: document.getElementById('root')?.childElementCount ?? 0,
    hasApp: !!document.querySelector('.app'),
    hasToolbar: !!document.querySelector('.toolbar'),
    hasTimeline: !!document.querySelector('.timeline'),
    laneCount: document.querySelectorAll('.lane').length,
    hasPreviewCanvas: !!document.querySelector('.preview canvas'),
  }));

  await page.screenshot({ path: SHOT, fullPage: false });
  await browser.close();

  console.log('--- render check ---');
  console.log(JSON.stringify(ui, null, 2));
  console.log('--- pageerrors ---');
  console.log(pageErrors.length ? pageErrors.join('\n') : '(none)');
  console.log('--- console.errors ---');
  console.log(consoleErrors.length ? consoleErrors.join('\n') : '(none)');
  console.log(`--- screenshot: ${SHOT} ---`);

  const ok =
    ui.hasApp && ui.hasToolbar && ui.hasTimeline && ui.laneCount >= 2 &&
    pageErrors.length === 0 && consoleErrors.length === 0;
  if (!ok) {
    console.error('\nSMOKE FAIL');
    exitCode = 1;
  } else {
    console.log('\nSMOKE PASS');
  }
} catch (err) {
  console.error('SMOKE ERROR:', err);
  exitCode = 1;
} finally {
  server.kill('SIGTERM');
}

process.exit(exitCode);
