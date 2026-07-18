// Shared helpers for reading Claude Design self-extracting bundles.
// A bundle HTML contains three script blocks:
//   <script type="__bundler/manifest">      JSON: { uuid: {mime, compressed, data(base64)} }
//   <script type="__bundler/ext_resources">  JSON: [ {uuid, id} ]  (id = e.g. React CDN url or "g_<unsplash>_<w>")
//   <script type="__bundler/template">       JSON string: the page HTML, asset refs are bare UUIDs
// The runtime loader decodes each asset, gzip-gunzips when compressed, then
// does template.split(uuid).join(url) for every uuid. We mirror that offline.

import zlib from 'node:zlib';
import crypto from 'node:crypto';

/** Extract the raw (still-JSON) text of one __bundler/<name> block. */
export function extractBlock(html, name) {
  const re = new RegExp(
    '<script type="__bundler/' + name + '">([\\s\\S]*?)</script>',
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

/** Parse all three blocks from a bundle's HTML. template is the decoded HTML string. */
export function parseBundle(html) {
  const manifestRaw = extractBlock(html, 'manifest');
  const templateRaw = extractBlock(html, 'template');
  const extRaw = extractBlock(html, 'ext_resources');
  if (!manifestRaw || !templateRaw) {
    throw new Error('missing manifest/template block');
  }
  return {
    manifest: JSON.parse(manifestRaw),
    template: JSON.parse(templateRaw), // JSON string -> raw HTML
    extResources: extRaw ? JSON.parse(extRaw) : [],
  };
}

/** Decode one manifest entry to raw bytes (Buffer), mirroring the loader's gunzip step. */
export function decodeEntry(entry) {
  const bytes = Buffer.from(entry.data, 'base64');
  return entry.compressed ? zlib.gunzipSync(bytes) : bytes;
}

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
