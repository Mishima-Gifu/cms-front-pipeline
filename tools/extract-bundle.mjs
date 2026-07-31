// 自己展開バンドル（mockups/<page>.html）を静的アセット＋清書済みHTMLへ変換する。
//   - manifest の全アセットを復号し、ページ横断で sha256 により重複排除
//   - フォント(woff2)・画像(jpg) を <publicDir>/assets へ出力
//   - fonts.css（unicode-range サブセット）と site.css（ベースCSS）を生成
//   - 各ページの middle 断片（<buildDir>/fragments）を手組み用に出力
//   - role:'static' のページを parts/ include の .php として出力
//   - images:'gallery' のページ用に <buildDir>/gallery-items.json（id->画像パス）を出力
//
// 設定は convert.config.json（ページ構成・フォント名・出力先など）で駆動する。
// 案件固有のハードコードは持たず、新規案件は config 差し替えのみで流用できる。
import fs from 'node:fs';
import path from 'node:path';
import { parseBundle, decodeEntry, sha256 } from './lib/bundle.mjs';
import {
  extractStyles, extractMiddle, fixCamelAttrs, stripToolAttrs,
  replaceAssetRefs, htmlLinksToPhp,
} from './lib/transform.mjs';
import { loadConfig } from './lib/config.mjs';

/**
 * バンドル変換の本体。convert.mjs からも単体実行(下部の CLI guard)からも呼ばれる。
 * @param {object} cfg loadConfig() が返す設定（*Abs 付き）
 */
export function extractBundle(cfg) {
  const MOCK_DIR = cfg.mockDirAbs;
  const PUBLIC = cfg.publicDirAbs;
  const ASSETS = path.join(PUBLIC, 'assets');
  const FONT_DIR = path.join(ASSETS, 'fonts', cfg.font.family);
  const IMG_DIR = path.join(ASSETS, 'img');
  const CSS_DIR = path.join(ASSETS, 'css');
  const FRAG = path.join(cfg.buildDirAbs, 'fragments');
  // 断片は毎回作り直す。ファイル名に案件名が入らないため、buildDir を案件間で共有していると
  // 別案件・旧構成の残骸が残り、postBuild がそれを読んで本文が混入する（エラーにならない）。
  fs.rmSync(FRAG, { recursive: true, force: true });
  for (const d of [FONT_DIR, IMG_DIR, CSS_DIR, FRAG]) fs.mkdirSync(d, { recursive: true });

  const PAGES = cfg.pages;
  const pageKeys = Object.keys(PAGES); // ← 反復順がアセット採番順。config の記述順を保つこと。

  // .html→.php 変換の対象 slug（pages ＋ ページ生成しないが参照される navExtra）。
  const linkSlugs = [...pageKeys, ...(cfg.navExtra || [])];

  const bundles = {};
  for (const page of pageKeys) {
    bundles[page] = parseBundle(fs.readFileSync(path.join(MOCK_DIR, page + '.html'), 'utf8'));
  }

  // ---- 1. フォント: 内容で重複排除し、フォントCSS内の出現順に採番 ----
  const hashToFontName = new Map();
  let fontCssCanonical = null;

  function buildFontCss(page) {
    const { manifest, template } = bundles[page];
    const { fontCss } = extractStyles(template);
    // 各 url("uuid") を重複排除後の woff2 パス（出現順命名）へ置換する。
    const out = fontCss.replace(/url\("([0-9a-f-]{36})"\)/gi, (whole, uuid) => {
      const entry = manifest[uuid];
      if (!entry) return whole;
      const buf = decodeEntry(entry);
      const hash = sha256(buf);
      let name = hashToFontName.get(hash);
      if (!name) {
        name = cfg.font.prefix + '-' + String(hashToFontName.size).padStart(3, '0') + '.woff2';
        hashToFontName.set(hash, name);
        fs.writeFileSync(path.join(FONT_DIR, name), buf);
      }
      return `url(../fonts/${cfg.font.family}/${name})`;
    });
    return out;
  }

  for (const page of pageKeys) {
    const css = buildFontCss(page);
    if (fontCssCanonical === null) fontCssCanonical = css;
    else if (css !== fontCssCanonical) {
      // 先頭ページを canonical とし、差異は警告のみ（単一 fonts.css 前提）。
      console.warn(`WARN: ${page} font CSS differs from canonical (per-page fonts.css would be needed)`);
    }
  }
  fs.writeFileSync(path.join(CSS_DIR, 'fonts.css'), fontCssCanonical, 'utf8');
  console.log(`fonts: ${hashToFontName.size} unique woff2 written`);

  // ---- 2. site.css: ページ横断でベースCSSの行を union ----
  const baseLines = new Set();
  for (const page of pageKeys) {
    const { baseCss } = extractStyles(bundles[page].template);
    baseCss.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => baseLines.add(l));
  }
  const siteCss = [...baseLines].join('\n') + '\n';
  fs.writeFileSync(path.join(CSS_DIR, 'site.css'), siteCss, 'utf8');

  // ---- 3. 画像: ページ別 images モードで抽出 ----
  //   inline  : 本文 <img src="uuid"> を <page>-NN.jpg で抽出（断片にもパス置換で反映）
  //   gallery : ext_resources の g_ id 経由で抽出し gallery-items.json 出力
  //             （bare UUID は断片に残す＝動的ギャラリー組み立てに委ねる）
  //   none    : 抽出なし
  const hashToImgName = new Map();
  function writeImage(buf, preferredName) {
    const hash = sha256(buf);
    let name = hashToImgName.get(hash);
    if (!name) {
      name = preferredName;
      hashToImgName.set(hash, name);
      fs.writeFileSync(path.join(IMG_DIR, name), buf);
    }
    return name;
  }

  // inline: <img src="uuid"> を出現順に <page>-NN.jpg で採番。断片へ反映する uuid->path を返す。
  function inlineImageMap(page) {
    const { manifest, template } = bundles[page];
    const map = {};
    let n = 0;
    for (const m of template.matchAll(/<img src="([0-9a-f-]{36})"/gi)) {
      const uuid = m[1];
      const entry = manifest[uuid];
      if (!entry || !entry.mime.startsWith('image/')) continue;
      n += 1;
      const name = writeImage(decodeEntry(entry), `${page}-${String(n).padStart(2, '0')}.jpg`);
      // 相対パス（先頭スラッシュ無し）で出力する。フロント各ページは公開ルート直下に
      // 横並び（サブディレクトリ階層なし）のため、相対でルート公開・サブディレクトリ公開
      // （例 WP同居の /cms/ 配下）双方で正しく解決される。絶対にすると /cms/ 配下で親側を見に行き当たらない。
      map[uuid] = 'assets/img/' + name;
    }
    return map;
  }

  // gallery: ext_resources の "g_<id>" 画像を <page>-<id>.jpg で抽出。id->path を返す（断片には反映しない）。
  function galleryImageMap(page) {
    const { manifest, extResources } = bundles[page];
    const idToPath = {};
    for (const r of extResources) {
      if (!r.id.startsWith('g_')) continue; // react/react-dom などCDNエントリは除外
      const entry = manifest[r.uuid];
      if (!entry || !entry.mime.startsWith('image/')) continue;
      const cleanId = r.id.slice(2); // "g_" を除去
      const name = writeImage(decodeEntry(entry), `${page}-${cleanId}.jpg`);
      // 相対パスで出力（理由は inlineImageMap 内のコメント参照。ルート/サブディレクトリ双方対応）。
      idToPath[r.id] = 'assets/img/' + name;
    }
    return idToPath;
  }

  const inlineMaps = {};   // page -> uuid->path（断片へ反映）
  const galleryIdToPath = {}; // gallery-items.json 用（全 gallery ページをマージ）
  let hasGalleryPage = false;
  for (const page of pageKeys) {
    const mode = PAGES[page].images || 'none';
    if (mode === 'inline') {
      inlineMaps[page] = inlineImageMap(page);
    } else if (mode === 'gallery') {
      hasGalleryPage = true;
      Object.assign(galleryIdToPath, galleryImageMap(page));
    }
  }
  const inlineRefCount = Object.values(inlineMaps).reduce((a, m) => a + Object.keys(m).length, 0);
  console.log(`images: ${hashToImgName.size} unique jpg written (inline refs ${inlineRefCount}, gallery ids ${Object.keys(galleryIdToPath).length})`);
  if (hasGalleryPage) {
    fs.writeFileSync(path.join(cfg.buildDirAbs, 'gallery-items.json'),
      JSON.stringify({ idToPath: galleryIdToPath }, null, 2), 'utf8');
  }

  // ---- 4. middle 断片（清書）を全ページ分出力 ----
  function cleanMiddle(page, uuidToPath = {}) {
    let mid = extractMiddle(bundles[page].template);
    if (mid === null) throw new Error(`no middle for ${page}`);
    mid = fixCamelAttrs(mid);
    mid = stripToolAttrs(mid);
    mid = replaceAssetRefs(mid, uuidToPath);
    mid = htmlLinksToPhp(mid, linkSlugs);
    return mid;
  }

  for (const page of pageKeys) {
    // inline モードのページだけ画像パスを断片へ反映。gallery/none は bare UUID を残す。
    const uuidMap = inlineMaps[page] || {};
    const mid = cleanMiddle(page, uuidMap);
    fs.writeFileSync(path.join(FRAG, page + '.middle.html'), mid, 'utf8');
    // 健全性チェック: 静的ページに置換漏れの bare UUID が無いか
    const leftover = (mid.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) || []).length;
    if (leftover) console.warn(`WARN: ${page} middle has ${leftover} leftover UUID(s)`);
  }

  // ---- 5. role:'static' のページを parts/ include の .php として出力 ----
  function writeStaticPhp(page) {
    const { title, active } = PAGES[page];
    const mid = fs.readFileSync(path.join(FRAG, page + '.middle.html'), 'utf8');
    const php =
`<?php
$page_title = ${JSON.stringify(title)};
$active = ${JSON.stringify(active)};
require __DIR__ . '/parts/header.php';
?>
${mid}
<?php require __DIR__ . '/parts/footer.php'; ?>
`;
    fs.writeFileSync(path.join(PUBLIC, page + '.php'), php, 'utf8');
  }
  const staticPages = pageKeys.filter((p) => PAGES[p].role === 'static');
  for (const page of staticPages) writeStaticPhp(page);
  console.log(`wrote static: ${staticPages.map((p) => p + '.php').join(' / ') || '(none)'}`);
  const dynamicPages = pageKeys.filter((p) => PAGES[p].role === 'dynamic');
  console.log(`fragments only (dynamic, hand-authored/postBuild): ${dynamicPages.join(' / ') || '(none)'}`);
}

// ---- CLI 単体実行（node tools/extract-bundle.mjs）: 既定 config を読んで実行 ----
// 単体実行でも案件 public/ を上書きするため convert.mjs と同じ確認を通す。
// この経路は --config を解釈しない（既定 config 固定）ので、受けるのは --yes のみ。
// トップレベル await はこの if の中だけ。convert.mjs から import された場合は
// 条件が偽で評価されず、モジュールが async module になるだけで挙動は変わらない。
import { fileURLToPath } from 'node:url';
import { confirmPublicWrite } from './lib/confirm.mjs';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cfg = loadConfig();
  const yes = process.argv.includes('--yes') || process.argv.includes('-y');
  if (await confirmPublicWrite(cfg, { yes })) extractBundle(cfg);
}
