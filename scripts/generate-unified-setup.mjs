import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replaceAll('\r\n', '\n');
const source = read('scripts/unified-setup-template.py').replace(
  '# __BUNDLED_ENGINES__',
  `METRICS_SOURCE = "${Buffer.from(read('public/setup-posix.py')).toString('base64')}"\nHISTORY_SOURCE = "${Buffer.from(read('public/setup-history.py')).toString('base64')}"`,
);
fs.writeFileSync(path.join(root, 'public/setup-unified.py'), source);
const windows = read('scripts/windows-setup-template.ps1');
fs.writeFileSync(
  path.join(root, 'public/setup-pc.ps1'),
  windows.replace('__SOURCE__', Buffer.from(source).toString('base64')),
);
console.log('Generated unified Python engine and standalone Windows installer.');
