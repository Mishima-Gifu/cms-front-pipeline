// 本番 FTP アップ用のデプロイツリーを build/deploy/{案件名}/ に生成する（汎用・依存なし）。
//
// 背景: リポジトリのソースには設計意図コメントを残す方針（CLAUDE.md）だが、
//       CSS コメントと HTML コメントはそのままブラウザへ配信され、誰でも読めてしまう。
//       そこで「ソースは読みやすいまま・配信物からだけコメントを剥がす」変換をここで行う。
//
// 処理内容:
//   - <publicDir> とその親の lib/ を build/deploy/{案件名}/ へコピー
//     （public だけ上げて lib を上げ忘れると未定義関数で全フロント 500 になるため、
//       デプロイ単位を「このツリーごと」に固定する狙いも兼ねる。
//       出力パスに案件名を挟むのは、複数案件を並行して扱うときに FTP で
//       アップロード元を取り違える事故を防ぐため）
//   - *.css : /* ... */ コメントを除去（content:"*/" のような文字列内は誤爆しないよう解析する）
//   - *.php : HTML 領域の <!-- ... --> を除去する【安全網】。
//             本来はソース側で PHP コメント（<?php /* ... */ ?>）に書く規約であり、
//             除去が発生した場合はソースを直すよう警告を出す。
//             PHP コード領域（<?php ... ?> / <?= ... ?>）内は一切触らない
//             （sitemap.php が echo する診断コメントのような「意図した出力」を壊さないため）。
//   - uploads/ : 画像実体はコピーしない（本番の実体は管理画面の登録で蓄積される運用。
//                ローカルの検証用画像で本番を上書きしないため）。.htaccess（PHP実行禁止）のみ維持。
//
// 使い方: npm run deploy-prep（= node tools/deploy-prep.mjs）／tools/deploy-prep.bat
//         FTP では build/deploy/{案件名}/ の中身（public/・lib/）を本番の対応ディレクトリへアップする。
//         config/config.php と data/app.sqlite は本番サーバ上で管理し、このツリーには含めない。
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ROOT } from './lib/config.mjs';

// ---- CSS: 文字列リテラルを尊重しつつ /* ... */ を除去する ----
// 単純な正規表現 /\/\*[\s\S]*?\*\//g だと content:"*/" 等で壊れるため、
// 1文字ずつ走査して「クォート内はコメント開始とみなさない」小さな状態機械で処理する。
function stripCssComments(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      // 文字列リテラル: エスケープ(\)を考慮して閉じクォートまで素通しする
      const quote = ch;
      let j = i + 1;
      while (j < css.length) {
        if (css[j] === '\\') j += 2;
        else if (css[j] === quote) { j++; break; }
        else j++;
      }
      out += css.slice(i, j);
      i = j;
    } else if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2; // 閉じ忘れは末尾まで＝コメント扱い（CSS仕様と同じ）
    } else {
      out += ch;
      i++;
    }
  }
  // コメント除去で生じた行末空白・3行以上の連続空行・先頭空行を整理する（挙動には影響しない）
  return out
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '');
}

// ---- PHP: ソースを「PHPコード領域」と「HTML領域」に分割する ----
// 開始タグは <?php / <?= のみを認識する（素の <? を対象にすると、echo で出力する
// XML 宣言 '<?xml' 等と衝突するため。本コードベースも short_open_tag を使わない前提）。
// 終端 ?> の探索は PHP 本体のトークナイザ挙動に合わせる:
//   - 文字列リテラル（'…' / "…"）内の ?> は閉じタグではない（sitemap.php の '<?xml … ?>' が該当）
//   - /* … */ ブロックコメント内の ?> も閉じタグではない
//   - // / # の行コメント内の ?> は【閉じタグとして機能する】（PHP 仕様どおり）
// 非対応: ヒアドキュメント/Nowdoc（<<<）内の ?>。現状のコードベースでは未使用（検証済み）。
const PHP_OPEN_RE = /<\?(?:php\b|=)/g;

function findPhpClose(src, from) {
  let j = from;
  while (j < src.length) {
    const ch = src[j];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      j++;
      while (j < src.length) {
        if (src[j] === '\\') j += 2;               // エスケープは次の1文字ごと飛ばす
        else if (src[j] === quote) { j++; break; }
        else j++;
      }
    } else if (ch === '/' && src[j + 1] === '*') {
      const e = src.indexOf('*/', j + 2);
      j = e === -1 ? src.length : e + 2;
    } else if ((ch === '/' && src[j + 1] === '/') || ch === '#') {
      // 行コメント: 改行または ?> で終わる（?> はここでも閉じタグになる）
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '?' && src[j + 1] === '>') return j + 2;
        j++;
      }
    } else if (ch === '?' && src[j + 1] === '>') {
      return j + 2;
    } else {
      j++;
    }
  }
  return src.length; // 閉じタグなし＝ファイル末尾まで PHP（純PHPファイルの通常形）
}

function splitPhpSegments(src) {
  const parts = []; // { php: boolean, text: string }
  let i = 0;
  while (i < src.length) {
    PHP_OPEN_RE.lastIndex = i;
    const m = PHP_OPEN_RE.exec(src);
    if (!m) {
      parts.push({ php: false, text: src.slice(i) });
      break;
    }
    if (m.index > i) parts.push({ php: false, text: src.slice(i, m.index) });
    const end = findPhpClose(src, m.index + m[0].length);
    parts.push({ php: true, text: src.slice(m.index, end) });
    i = end;
  }
  return parts;
}

// HTML 領域内の <!-- ... --> を除去し、除去したコメントを notices に積む。
// 領域をまたぐコメント（<!-- の中に <?php ... ?> を挟む等）は安全のため触らず警告のみ。
function stripHtmlComments(src, relPath, notices) {
  const parts = splitPhpSegments(src);
  let changed = false;
  for (const part of parts) {
    if (part.php) continue;
    if (!part.text.includes('<!--')) continue;
    part.text = part.text.replace(/<!--[\s\S]*?-->/g, (m) => {
      const summary = m.replace(/\s+/g, ' ').slice(0, 60);
      notices.push(`${relPath}: HTMLコメントを除去しました → ソースをPHPコメントへ書き換えること: ${summary}`);
      changed = true;
      return '';
    });
    if (part.text.includes('<!--')) {
      notices.push(`${relPath}: 閉じられていない <!-- を検出（除去せず残しました）。ソースを確認すること。`);
    }
  }
  return { text: parts.map((p) => p.text).join(''), changed };
}

// ---- コピー & 変換 ----
function walkFiles(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

function main() {
  const cfg = loadConfig(process.argv.includes('--config')
    ? process.argv[process.argv.indexOf('--config') + 1]
    : undefined);

  const publicDir = cfg.publicDirAbs;                 // 例: <ROOT>/../{案件名}/public
  const siteDir = path.dirname(publicDir);            // 例: <ROOT>/../{案件名}
  const libDir = path.join(siteDir, 'lib');
  const uploadsDir = path.join(publicDir, 'uploads');
  // 出力先に案件名（案件リポのディレクトリ名）を挟む。取り違えが起きるのは FTP クライアントで
  // アップロード元を選ぶ瞬間＝ツールの外なので、パス自体に案件名を含めて構造的に防ぐ。
  // 削除対象も自案件のサブツリーだけになり、他案件の準備済みツリーを壊さない。
  const projectName = path.basename(siteDir);
  const outDir = path.join(ROOT, 'build', 'deploy', projectName);

  if (!fs.existsSync(publicDir)) {
    console.error(`[deploy-prep] publicDir が見つかりません: ${publicDir}`);
    process.exit(1);
  }

  // 出力先は毎回作り直す（前回の残骸＝本番に無いはずのファイルを混ぜないため）
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  // uploads/ は画像実体を除外し .htaccess だけ通すフィルタ
  // startsWith 判定は区切り文字まで含めて行う（例: uploads2/ のような前方一致ディレクトリへの誤爆防止）
  const uploadsFilter = (src) => {
    if (src !== uploadsDir && !src.startsWith(uploadsDir + path.sep)) return true;
    if (fs.statSync(src).isDirectory()) return true;  // ディレクトリ構造は維持
    return path.basename(src) === '.htaccess';
  };

  fs.cpSync(publicDir, path.join(outDir, 'public'), { recursive: true, filter: uploadsFilter });
  if (fs.existsSync(libDir)) {
    fs.cpSync(libDir, path.join(outDir, 'lib'), { recursive: true });
  } else {
    console.warn(`[deploy-prep] lib/ が見つからないためスキップ: ${libDir}`);
  }

  // コピー後のツリーに対してコメント除去をかける（ソースは一切変更しない）
  const notices = [];
  let cssCount = 0, cssSaved = 0, phpStripped = 0;
  for (const file of walkFiles(outDir)) {
    const rel = path.relative(outDir, file).replaceAll('\\', '/');
    if (file.endsWith('.css')) {
      const before = fs.readFileSync(file, 'utf8');
      const after = stripCssComments(before);
      fs.writeFileSync(file, after);
      cssCount++;
      cssSaved += Buffer.byteLength(before) - Buffer.byteLength(after);
    } else if (file.endsWith('.php')) {
      const before = fs.readFileSync(file, 'utf8');
      const { text, changed } = stripHtmlComments(before, rel, notices);
      if (changed) {
        fs.writeFileSync(file, text);
        phpStripped++;
      }
    }
  }

  // コピー元も出力する（どの案件を対象に実行したかをログだけで追えるようにする）
  console.log(`[deploy-prep] 対象案件: ${projectName}`);
  console.log(`[deploy-prep] コピー元: ${publicDir}`);
  console.log(`[deploy-prep] 出力: ${outDir}`);
  console.log(`[deploy-prep] CSS ${cssCount} ファイルからコメント除去（計 ${cssSaved} バイト削減）`);
  if (notices.length) {
    console.log(`[deploy-prep] ⚠ HTMLコメントを ${phpStripped} ファイルで除去しました。配信物には含まれませんが、規約どおりソース側を PHP コメントに直してください:`);
    for (const n of notices) console.log(`  - ${n}`);
  } else {
    console.log('[deploy-prep] .php に HTML コメントはありません（規約OK）');
  }
  console.log(`[deploy-prep] FTP では build/deploy/${projectName}/ の中身（public/・lib/）をアップしてください。`);
}

main();
