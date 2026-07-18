// Diagnostic pass: understand each bundle's template + manifest before writing
// the real transform. Writes a report to build/analyze-report.txt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBundle, decodeEntry } from './lib/bundle.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MOCK_DIR = path.join(ROOT, 'mockups');
const BUILD = path.join(ROOT, 'build');
fs.mkdirSync(BUILD, { recursive: true });

const PAGES = ['index', 'gallery', 'shop', 'faq', 'privacy'];
const out = [];
const log = (s = '') => out.push(s);

for (const page of PAGES) {
  const file = path.join(MOCK_DIR, page + '.html');
  const html = fs.readFileSync(file, 'utf8');
  const { manifest, template, extResources } = parseBundle(html);

  log('='.repeat(70));
  log(`PAGE: ${page}   (html ${(html.length / 1e6).toFixed(2)} MB)`);
  log('='.repeat(70));

  // manifest: mime histogram + compressed count
  const mime = {};
  let compressed = 0;
  for (const uuid of Object.keys(manifest)) {
    const e = manifest[uuid];
    mime[e.mime] = (mime[e.mime] || 0) + 1;
    if (e.compressed) compressed++;
  }
  log(`assets: ${Object.keys(manifest).length}  compressed: ${compressed}`);
  log('mime histogram: ' + JSON.stringify(mime, null, 0));

  // ext_resources sample
  log(`ext_resources: ${extResources.length}`);
  for (const r of extResources.slice(0, 6)) log('  ' + JSON.stringify(r));
  if (extResources.length > 6) log('  ...');

  // template overview
  log(`template length: ${template.length}`);
  // <style> blocks
  const styles = [...template.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
  log(`<style> blocks: ${styles.length}`);
  styles.forEach((s, i) => log(`  style[${i}] len=${s[1].length}  head="${s[1].slice(0, 80).replace(/\s+/g, ' ')}"`));
  // <script> tags (opening tag only)
  const scripts = [...template.matchAll(/<script[^>]*>/gi)];
  log(`<script> tags: ${scripts.length}`);
  scripts.forEach((s, i) => log(`  script[${i}] ${s[0].slice(0, 120)}`));
  // <link> tags
  const links = [...template.matchAll(/<link[^>]*>/gi)];
  log(`<link> tags: ${links.length}`);
  links.slice(0, 10).forEach((l, i) => log(`  link[${i}] ${l[0].slice(0, 120)}`));
  // helmet / x-dc / custom elements
  log(`<helmet occurrences: ${(template.match(/<helmet/gi) || []).length}`);
  log(`<x-dc occurrences: ${(template.match(/<x-dc/gi) || []).length}`);
  log(`data-dc-script occurrences: ${(template.match(/data-dc-script/gi) || []).length}`);
  log(`<sc-for occurrences: ${(template.match(/<sc-for/gi) || []).length}`);
  log(`{{ ... }} bindings: ${(template.match(/\{\{[^}]*\}\}/g) || []).length}`);
  log(`unsplash refs: ${(template.match(/images\.unsplash\.com/g) || []).length}`);

  // How many UUIDs actually appear in template, and in what attribute contexts
  const uuids = Object.keys(manifest);
  let refCount = 0;
  const ctxSamples = [];
  for (const uuid of uuids) {
    const idx = template.indexOf(uuid);
    if (idx >= 0) {
      refCount++;
      if (ctxSamples.length < 8) {
        ctxSamples.push(template.slice(Math.max(0, idx - 40), idx + 40).replace(/\s+/g, ' '));
      }
    }
  }
  log(`UUIDs referenced in template: ${refCount} / ${uuids.length}`);
  ctxSamples.forEach((c, i) => log(`  ref-ctx[${i}] ...${c}...`));

  // First 2500 chars of template (head structure)
  log('--- template head (first 2500 chars) ---');
  log(template.slice(0, 2500));
  log('--- template body start (chars 2500-5000) ---');
  log(template.slice(2500, 5000));
  log('');
}

const reportPath = path.join(BUILD, 'analyze-report.txt');
fs.writeFileSync(reportPath, out.join('\n'), 'utf8');
console.log('wrote ' + reportPath + '  (' + out.length + ' lines)');
