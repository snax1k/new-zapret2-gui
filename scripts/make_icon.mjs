// Собирает app.ico и public/logo.svg из исходников в assets/icon/.
//
//   npm i --no-save @resvg/resvg-js@2.6.2
//   node scripts/make_icon.mjs
//
// Каждый размер рисуется из SVG отдельно, а не уменьшается с 256: мелкие
// значки (16, 20, 24 — трей и заголовок окна при 100–150 % масштаба)
// нарисованы под свою пиксельную сетку, иначе «Z2» расплывается в пятно.
// Внутри ico — PNG-кадры, как и раньше: csc и Windows Vista+ их принимают.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let Resvg;
try {
  ({ Resvg } = await import('@resvg/resvg-js'));
} catch {
  console.error('Нет @resvg/resvg-js. Поставьте: npm i --no-save @resvg/resvg-js@2.6.2');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (name) => join(root, 'assets', 'icon', name);

// Размер кадра → исходник. Всё от 32 и выше — из основного рисунка.
const FRAMES = [
  [16, 'icon-16.svg'], [20, 'icon-20.svg'], [24, 'icon-24.svg'],
  [32, 'icon.svg'], [40, 'icon.svg'], [48, 'icon.svg'],
  [64, 'icon.svg'], [128, 'icon.svg'], [256, 'icon.svg'],
];

const pngs = FRAMES.map(([size, file]) => {
  const svg = readFileSync(src(file), 'utf8');
  return [size, new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()];
});

// Формат ico: заголовок 6 байт, по 16 байт на кадр, затем сами PNG.
const header = Buffer.alloc(6 + 16 * pngs.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach(([size, png], i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(size >= 256 ? 0 : size, e);
  header.writeUInt8(size >= 256 ? 0 : size, e + 1);
  header.writeUInt8(0, e + 2);
  header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(png.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += png.length;
});

const ico = Buffer.concat([header, ...pngs.map(([, png]) => png)]);
writeFileSync(join(root, 'app.ico'), ico);
copyFileSync(src('icon.svg'), join(root, 'public', 'logo.svg'));
console.log(`app.ico: ${pngs.map(([s]) => s).join(', ')} px, ${ico.length} байт; public/logo.svg обновлён`);
