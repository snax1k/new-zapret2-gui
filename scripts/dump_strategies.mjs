// Печатает библиотеку стратегий из src/lib/zapretCommand.ts в JSON.
//
// Нужна verify_args.ps1: раньше варианты были переписаны в скрипт руками,
// и при двадцати вариантах копия неизбежно разошлась бы с интерфейсом.
// Модуль транспилируется компилятором TypeScript из node_modules — он
// импортирует из ../types только типы, и при транспиляции эти импорты
// исчезают.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'src', 'lib', 'zapretCommand.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
}).outputText;

const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const out = mod.YOUTUBE_STRATEGIES.map(s => ({ id: s.id, label: s.label, options: s.options.join(' ') }));
process.stdout.write(JSON.stringify(out));
