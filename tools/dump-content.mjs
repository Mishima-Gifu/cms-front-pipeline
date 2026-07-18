// Dump each page's content markup (template minus the giant font-face <style>)
// so it's small enough to read. Writes build/content/<page>.html.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBundle } from './lib/bundle.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MOCK_DIR = path.join(ROOT, 'mockups');
const OUT = path.join(ROOT, 'build', 'content');
fs.mkdirSync(OUT, { recursive: true });

for (const page of ['index', 'gallery', 'shop', 'faq', 'privacy']) {
  const html = fs.readFileSync(path.join(MOCK_DIR, page + '.html'), 'utf8');
  const { template } = parseBundle(html);
  // Remove the first <style> block (the @font-face one). Non-greedy; style has no nested tags.
  const content = template.replace(/<style>@font-face[\s\S]*?<\/style>/, '<style>/* FONT-FACE BLOCK REMOVED */</style>');
  fs.writeFileSync(path.join(OUT, page + '.html'), content, 'utf8');
  console.log(`${page}: content ${content.length} bytes`);
}
