// Claude Design バンドル → 静的アセット＋PHP 変換の 1 コマンド・オーケストレータ。
//
// 使い方:
//   node tools/convert.mjs                 … tools/convert.config.json で変換
//   node tools/convert.mjs --config x.json … 別の設定で変換
//   node tools/convert.mjs --yes           … 案件 public/ 上書きの確認を省略する
//   （Windows は tools/convert.bat / convert.ps1 をダブルクリック or 実行でも可）
//
// 実行順: extractBundle(cfg) → cfg.postBuild の各モジュールの postBuild(cfg) を順に実行。
//
// 動的ページ（index/gallery 等）は案件ごとにマークアップが異なり機械変換できないため、
// convert 本体では自動生成しない。案件固有の組み立ては postBuild フック（例 build-index.mjs）へ委ねる。
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, TOOLS_DIR } from './lib/config.mjs';
import { confirmPublicWrite } from './lib/confirm.mjs';
import { extractBundle } from './extract-bundle.mjs';

function parseArgs(argv) {
  const out = { config: undefined, yes: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config' || argv[i] === '-c') out.config = argv[++i];
    else if (argv[i] === '--yes' || argv[i] === '-y') out.yes = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig(args.config);

  console.log('=== convert start ===');
  console.log(`config : ${cfg.configPath}`);
  console.log(`mock   : ${cfg.mockDirAbs}`);
  console.log(`public : ${cfg.publicDirAbs}`);

  // 案件 public/ を上書きする前に対象を確認する（書き込みは以降のすべてで発生する）。
  if (!await confirmPublicWrite(cfg, { yes: args.yes })) return;
  console.log('');

  // 1) バンドル → アセット / CSS / 断片 / 静的.php
  console.log('--- extract-bundle ---');
  extractBundle(cfg);
  console.log('');

  // 2) 案件固有の後処理フック（postBuild(cfg)）を順に実行
  const hooks = cfg.postBuild || [];
  if (hooks.length) {
    console.log('--- postBuild hooks ---');
    for (const modName of hooks) {
      // フックモジュールも tools/ 直下（__dirname 基準）で解決する（cwd 非依存）。
      const modPath = path.join(TOOLS_DIR, modName);
      const mod = await import(pathToFileURL(modPath).href);
      if (typeof mod.postBuild !== 'function') {
        throw new Error(`postBuild hook "${modName}" は export function postBuild(cfg) を持っていません`);
      }
      console.log(`> ${modName}`);
      await mod.postBuild(cfg);
    }
    console.log('');
  } else {
    console.log('(postBuild フックなし: 動的ページは手組みしてください)');
    console.log('');
  }

  console.log('=== convert done ===');
}

main().catch((err) => {
  console.error('convert failed:', err.message);
  process.exitCode = 1;
});
