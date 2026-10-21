// Пишет host-list/lists.json — номер версии списков, дату и SHA-256 каждого
// файла, который программа умеет обновлять из репозитория (NativeApp.cs,
// «Обновление списков сайтов»).
//
//   node scripts/lists_manifest.mjs          — обновить, если списки менялись
//   node scripts/lists_manifest.mjs --check  — только проверить: код 1, если устарел
//
// Версия растёт, только когда меняется содержимое хотя бы одного файла.
// Сборка (build.ps1) запускает скрипт сама. Чтобы списки уехали к
// пользователям без новой версии программы, запушьте host-list/ вместе с
// lists.json в main: программа проверяет его раз в 6 часов.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = ['list-general.txt', 'list-google.txt', 'list-exclude.txt'];
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'host-list');
const manifestPath = join(dir, 'lists.json');
const checkOnly = process.argv.includes('--check');

const files = FILES.map(name => {
  const buf = readFileSync(join(dir, name));
  const domains = buf.toString('utf8').split('\n')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('#')).length;
  return { name, sha256: createHash('sha256').update(buf).digest('hex'), domains };
});

const old = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const same = !!old && FILES.every(n =>
  (old.files || []).find(f => f.name === n)?.sha256 === files.find(f => f.name === n).sha256);

if (same) {
  console.log(`lists.json актуален: версия ${old.version} от ${old.updated}`);
  process.exit(0);
}
if (checkOnly) {
  console.error('lists.json устарел: списки менялись. Запустите node scripts/lists_manifest.mjs');
  process.exit(1);
}

// Порядок полей важен: нативная часть читает пары name → sha256 регулярным
// выражением, не разбирая JSON целиком.
const manifest = {
  version: (old?.version || 0) + 1,
  updated: new Date().toISOString().slice(0, 10),
  files
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`lists.json: версия ${manifest.version} от ${manifest.updated} — ` +
  files.map(f => `${f.name} (${f.domains})`).join(', '));
