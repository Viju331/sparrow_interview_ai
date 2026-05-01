/**
 * Generates all app icons from public/sparrow.png
 * Run: node scripts/generate-icons.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const pngToIco = (await import('png-to-ico')).default;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'public', 'sparrow.png');
const OUT = path.join(__dirname, '..', 'public');

// Generate PNG buffers for each ICO size
const icoSizes = [16, 32, 48, 64, 128, 256];
const pngBuffers = await Promise.all(
  icoSizes.map(size =>
    sharp(SRC).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  )
);

// Build Windows ICO
const icoBuffer = await pngToIco(pngBuffers);
const icoPath = path.join(OUT, 'icon.ico');
fs.writeFileSync(icoPath, icoBuffer);
console.log('Written:', icoPath, `(${(icoBuffer.length / 1024).toFixed(1)} KB)`);

// Build 512x512 PNG for Linux / macOS
const pngPath = path.join(OUT, 'icon.png');
await sharp(SRC).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(pngPath);
console.log('Written:', pngPath);

// 1024x1024 for macOS retina
const pngLargePath = path.join(OUT, 'icon-1024.png');
await sharp(SRC).resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(pngLargePath);
console.log('Written:', pngLargePath);

console.log('\nAll icons generated successfully.');
