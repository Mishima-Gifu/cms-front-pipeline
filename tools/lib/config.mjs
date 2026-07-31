// 変換パイプライン共通の設定ローダ。
// パスは cwd ではなく tools/ の位置（__dirname）基準で解決する。
// これにより .bat のダブルクリック起動やどのディレクトリから叩いても壊れない。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TOOLS_DIR = path.resolve(__dirname, '..');   // tools/
export const ROOT = path.resolve(TOOLS_DIR, '..');        // ワークスペース直下
export const CONFIG_DIR = path.join(ROOT, 'configs');     // 案件別設定の置き場（configs/{案件名}.json）

/**
 * 変換設定を読み込み、相対パスを絶対パスへ解決して返す。
 * configPath は必須。既定の設定ファイルを持たないのは、案件を取り違えたまま
 * 黙って完走させないため（どの案件に対して実行しているかを常にコマンドへ現す）。
 * 省略時はここで止め、指定方法を示す。
 * cfg.mockDir / publicDir / buildDir は「ワークスペース直下からの相対」を前提とし、
 * 解決済み絶対パスを cfg.mockDirAbs / publicDirAbs / buildDirAbs として付与する。
 * あわせて cfg.projectName（案件リポのディレクトリ名）を付与する。
 * ＝ publicDir の親。表示・確認プロンプト・出力先の切り分けに使う共通の導出元。
 */
export function loadConfig(configPath) {
  if (!configPath) {
    // 未指定のまま既定ファイルへ落とすと「どの案件か」が消えるので、ここで指定を促す。
    const names = fs.existsSync(CONFIG_DIR)
      ? fs.readdirSync(CONFIG_DIR).filter((f) => f.endsWith('.json') && f !== '_sample.json')
      : [];
    throw new Error(
      '設定ファイルが指定されていません。--config configs/{案件名}.json を付けて実行してください。'
      + (names.length ? `\n  利用できる設定: ${names.join(' / ')}` : '')
    );
  }
  const p = path.resolve(configPath);
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  cfg.configPath = p;
  cfg.mockDirAbs = path.resolve(ROOT, cfg.mockDir);
  cfg.publicDirAbs = path.resolve(ROOT, cfg.publicDir);
  cfg.buildDirAbs = path.resolve(ROOT, cfg.buildDir);
  cfg.projectName = path.basename(path.dirname(cfg.publicDirAbs));
  return cfg;
}
