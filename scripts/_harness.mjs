/**
 * scripts/_harness.mjs — shared helpers for the browser test scripts.
 *
 * - boots the Vite dev server
 * - resolves a usable Chromium (falls back to the full build if the headless
 *   shell wasn't downloaded)
 * - generates synthetic PNG / WAV assets so tests don't depend on fixtures
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

export const PORT = 4188;
export const URL = `http://localhost:${PORT}/`;
/** App URL with persistence disabled — for tests that need a clean slate. */
export const APP_URL = `${URL}?nopersist=1`;

export function startServer() {
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    // On Windows `npx` is `npx.cmd`; spawn needs a shell to resolve it.
    shell: process.platform === 'win32',
  });
  proc.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  return proc;
}

export async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(URL);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  throw new Error('Vite server did not start in time');
}

/** Find a launchable Chromium, preferring the full build if present. */
export function resolveChromium() {
  if (process.env.PW_EXECUTABLE) return process.env.PW_EXECUTABLE;
  const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(base)) return undefined;
  for (const dir of readdirSync(base)) {
    if (dir.startsWith('chromium-') && !dir.includes('headless')) {
      const candidates = [
        'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      ];
      for (const c of candidates) {
        const p = path.join(base, dir, c);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

export async function launch(chromium, opts = {}) {
  const launchOpts = { headless: true, ...opts };
  const exe = resolveChromium();
  if (exe) launchOpts.executablePath = exe;
  return chromium.launch(launchOpts);
}

// --- synthetic media ---------------------------------------------------------

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** A width×height RGB gradient PNG (no deps). */
export function makePng(width = 640, height = 360) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = Buffer.alloc((1 + width * 3) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      raw[o++] = Math.floor((x / width) * 255); // R
      raw[o++] = Math.floor((y / height) * 255); // G
      raw[o++] = 128; // B
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A mono 16-bit PCM WAV sine tone (no deps). */
export function makeWav(seconds = 2, sampleRate = 44100, freq = 440) {
  const n = Math.floor(seconds * sampleRate);
  const dataLen = n * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.3 * 32767;
    buf.writeInt16LE(s | 0, 44 + i * 2);
  }
  return buf;
}
