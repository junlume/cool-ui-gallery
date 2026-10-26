import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'MANIFEST.json'), 'utf8'));
let bytes = 0;
const failures = [];
for (const item of manifest.files) {
  const filename = path.resolve(root, item.path);
  if (!filename.startsWith(root + path.sep)) throw new Error('Invalid manifest path');
  if (!fs.existsSync(filename)) { failures.push(`${item.path} missing`); continue; }
  const data = fs.readFileSync(filename);
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  if (data.length !== item.bytes || hash !== item.sha256) failures.push(`${item.path} changed`);
  bytes += data.length;
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Verified ${manifest.files.length} files and ${bytes} bytes`);
  console.log('Source and media match the 2026-10-15 handoff snapshot');
}
