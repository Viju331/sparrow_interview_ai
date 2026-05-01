/**
 * Generates all app icons from public/sparrow.png
 * Outputs: public/icon.ico (Windows), public/icon.png (512px, Linux/macOS)
 * Run: node scripts/generate-icons.js
 */
const sharp = require('sharp');
const pngToIco = require('png-to-ico');
const path = require('path');
const fs = require('fs');

const SRC = path.join(__dirname, '..', 'public', 'sparrow.png');
const OUT = path.join(__dirname, '..', 'public');

async function main() {
  console.log('Reading source:', SRC);

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

  // Build 512x512 PNG for Linux and macOS (electron-builder converts .png to .icns on Mac)
  const pngPath = path.join(OUT, 'icon.png');
  await sharp(SRC).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(pngPath);
  const pngStat = fs.statSync(pngPath);
  console.log('Written:', pngPath, `(${(pngStat.size / 1024).toFixed(1)} KB)`);

  // Also write 1024x1024 for macOS retina (optional, same file used as .icns source)
  const pngLargePath = path.join(OUT, 'icon-1024.png');
  await sharp(SRC).resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(pngLargePath);
  console.log('Written:', pngLargePath);

  console.log('\nDone! Update electron-builder config to use:');
  console.log('  win.icon:   public/icon.ico');
  console.log('  mac.icon:   public/icon.png');
  console.log('  linux.icon: public/icon.png');
}

main().catch(err => { console.error(err); process.exit(1); });
