// String transforms that turn a decoded bundle template into clean static HTML.
// The dc-runtime would normally do these at render time; we bake them in offline.

/** Grab the two <style> blocks in <helmet>: [0] = @font-face, [1] = base css. */
export function extractStyles(template) {
  const styles = [...template.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const fontCss = styles.find((s) => s.includes('@font-face')) ?? '';
  const baseCss = styles.filter((s) => !s.includes('@font-face')).join('\n');
  return { fontCss, baseCss };
}

/** Pull the <header>…</header> block. */
export function extractHeader(template) {
  const m = template.match(/<header[\s\S]*?<\/header>/i);
  return m ? m[0] : null;
}

/** Pull the <footer>…</footer> block. */
export function extractFooter(template) {
  const m = template.match(/<footer[\s\S]*?<\/footer>/i);
  return m ? m[0] : null;
}

/** The page body between </header> and <footer> — the page-specific sections. */
export function extractMiddle(template) {
  const start = template.search(/<\/header>/i);
  const end = template.search(/<footer[^>]*>/i);
  if (start < 0 || end < 0) return null;
  return template.slice(start + '</header>'.length, end).trim();
}

/** sc-camel-view-box="…" -> viewBox="…"  (dc-runtime's camelCase encoding). */
export function fixCamelAttrs(html) {
  return html.replace(/sc-camel-([a-z-]+)=/g, (_, kebab) => {
    const camel = kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return camel + '=';
  });
}

/** Drop dc/tooling-only attributes that have no meaning in plain HTML. */
export function stripToolAttrs(html) {
  return html
    .replace(/\s+data-screen-label="[^"]*"/g, '')
    .replace(/\s+data-dc-atomics="[^"]*"/g, '')
    .replace(/\s+hint-placeholder-count="[^"]*"/g, '');
}

/** Replace bare-UUID asset references (src="uuid") using a uuid->path map. */
export function replaceAssetRefs(html, uuidToPath) {
  return html.replace(/(src|href)="([0-9a-f-]{36})"/gi, (whole, attr, uuid) => {
    const p = uuidToPath[uuid];
    return p ? `${attr}="${p}"` : whole;
  });
}

/** 正規表現メタ文字をエスケープ（slug に想定外の文字が来ても安全に組み立てるため）。 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * サイト内 .html リンクを .php に書き換える（ナビ・フッタ・ボタン）。
 * slugs は変換対象のページ slug 配列（例 ['index','gallery',...,'contact']）。
 * 案件ごとにページ名が異なるため固定リストにせず引数で受け取る（横展開のため）。
 * 未指定時は後方互換で花屋案件の固定リストを使う。
 */
export function htmlLinksToPhp(html, slugs) {
  const list = (slugs && slugs.length)
    ? slugs
    : ['index', 'gallery', 'shop', 'faq', 'privacy', 'contact'];
  const alt = list.map(escapeRegExp).join('|');
  const re = new RegExp(`href="(${alt})\\.html"`, 'g');
  return html.replace(re, 'href="$1.php"');
}
