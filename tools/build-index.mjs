// 案件固有の後処理フック（花屋案件専用）。
// build/fragments/index.middle.html の 2 つのサンプル節（news 行・gallery プレビューカード）を
// DB 駆動の PHP ループへ差し替え、header/footer include で囲んで index.php を組み立てる。
//
// このスクリプトは「母の日…」等の HTML 文字列リテラルを直接探して置換するため汎用化できない。
// よって convert.mjs は無条件では実行せず、convert.config.json の postBuild に列挙された案件だけが
// export した postBuild(cfg) を呼ぶ（他案件ではマーカー不一致で throw するのが正しい）。
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './lib/config.mjs';

/**
 * @param {object} cfg loadConfig() が返す設定（publicDirAbs / buildDirAbs を使う）
 */
export function postBuild(cfg) {
  const PUBLIC = cfg.publicDirAbs;
  const FRAG = path.join(cfg.buildDirAbs, 'fragments');

  let mid = fs.readFileSync(path.join(FRAG, 'index.middle.html'), 'utf8');

  // --- 1. News: 2 つのサンプル行を $news のループへ差し替え ---
  const newsSample =
`      <div style="display:flex;gap:14px;align-items:baseline"><span style="color:#B49A92;font-size:12px">2026.5.1</span><span>母の日のご予約受付中！バルーンとの組み合わせも好評です</span></div>
      <div style="display:flex;gap:14px;align-items:baseline"><span style="color:#B49A92;font-size:12px">2026.3.9</span><span>大学の卒業式でバルーンリリースを行いました</span></div>`;
  const newsLoop =
`      <?php foreach ($news as $n): ?>
      <div style="display:flex;gap:14px;align-items:baseline"><span style="color:#B49A92;font-size:12px"><?= h(front_date($n['disp_date'])) ?></span><span><?= h($n['title']) ?></span></div>
      <?php endforeach; ?>
      <?php if (!$news): ?>
      <div style="color:#B49A92">お知らせはまだありません。</div>
      <?php endif; ?>`;
  if (!mid.includes(newsSample)) throw new Error('news sample block not found');
  mid = mid.replace(newsSample, newsLoop);

  // --- 2. Gallery preview: 4 つのサンプルカードを $pickups のループへ差し替え ---
  const gridOpen = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px">';
  const moreWrap = '<div style="text-align:center;margin-top:26px">';
  const gi = mid.indexOf(gridOpen);
  const mi = mid.indexOf(moreWrap, gi);
  if (gi < 0 || mi < 0) throw new Error('gallery preview grid markers not found');
  const afterOpen = gi + gridOpen.length;
  const gridClose = mid.lastIndexOf('</div>', mi); // "more" ラッパ直前の grid 終了 </div>
  const cardsLoop =
`
      <?php foreach ($pickups as $p): ?>
      <a href="gallery.php?id=<?= (int) $p['id'] ?>" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 2px 12px rgba(90,60,50,0.08);text-decoration:none;color:inherit;display:block">
        <div style="height:170px">
          <?php if (!empty($p['file_path'])): ?>
          <img src="<?= h(front_thumb_url($p['file_path'])) ?>" alt="<?= h(($p['alt'] !== null && $p['alt'] !== '') ? $p['alt'] : $p['title']) ?>" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block">
          <?php else: ?>
          <div style="width:100%;height:100%;background:#F6EFEC;display:flex;align-items:center;justify-content:center;color:#C9B6AE;font-size:12px">No Image</div>
          <?php endif; ?>
        </div>
        <div style="padding:13px 15px 15px;display:flex;flex-direction:column;gap:8px">
          <?php if (!empty($p['cat_name'])): ?>
          <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
            <span style="font-size:10.5px;font-weight:900;padding:3px 9px;border-radius:99px;background:#FBE3EA;color:#E67C93"><?= h($p['cat_name']) ?></span>
          </div>
          <?php endif; ?>
          <div style="font-size:14px;font-weight:700;line-height:1.5"><?= h($p['title']) ?></div>
        </div>
      </a>
      <?php endforeach; ?>
      <?php if (!$pickups): ?>
      <p style="grid-column:1/-1;text-align:center;color:#B49A92;font-size:13px">ギャラリーは準備中です。</p>
      <?php endif; ?>
    `;
  mid = mid.slice(0, afterOpen) + cardsLoop + mid.slice(gridClose);

  // --- 3. PHP データブロック＋header/footer include で囲む ---
  const head =
`<?php
$page_title = 'トップ';
$active = 'home';
require __DIR__ . '/parts/header.php';

// お知らせ新着5件（テキストのみ）
$news = db_all(
    "SELECT id, title, COALESCE(published_at, created_at) AS disp_date
       FROM contents
      WHERE type_slug = 'news' AND " . FRONT_PUBLISHED_WHERE . "
      ORDER BY COALESCE(published_at, created_at) DESC, id DESC
      LIMIT 5"
);

// ギャラリー抜粋 最新6件（アイキャッチ優先→先頭画像をフォールバック、代表カテゴリ名も取得）
$pickups = db_all(
    "SELECT c.id, c.title, i.file_path, i.alt,
            (SELECT cat.name FROM categories cat
               JOIN content_category cc ON cc.category_id = cat.id
              WHERE cc.content_id = c.id ORDER BY cat.sort_order, cat.id LIMIT 1) AS cat_name
       FROM contents c
       LEFT JOIN images i ON i.id = (
            SELECT id FROM images WHERE content_id = c.id
             ORDER BY is_main DESC, sort_order, id LIMIT 1)
      WHERE c.type_slug = 'gallery' AND " . FRONT_PUBLISHED_WHERE . "
      ORDER BY COALESCE(c.published_at, c.created_at) DESC, c.id DESC
      LIMIT 6"
);
?>
`;
  const tail = `\n<?php require __DIR__ . '/parts/footer.php'; ?>\n`;

  fs.writeFileSync(path.join(PUBLIC, 'index.php'), head + mid + tail, 'utf8');
  console.log('wrote ' + path.join(cfg.publicDir, 'index.php'));
}

// ---- CLI 単体実行（node tools/build-index.mjs）: 既定 config を読んで実行 ----
import { fileURLToPath } from 'node:url';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  postBuild(loadConfig());
}
