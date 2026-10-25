import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const source = new URL('../public/icon.svg', import.meta.url);
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['icon-maskable.png', 512],
]) {
  await sharp(fileURLToPath(source))
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL(`../public/${name}`, import.meta.url)));
}
