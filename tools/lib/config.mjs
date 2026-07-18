// 変換パイプライン共通の設定ローダ。
// パスは cwd ではなく tools/ の位置（__dirname）基準で解決する。
// これにより .bat のダブルクリック起動やどのディレクトリから叩いても壊れない。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TOOLS_DIR = path.resolve(__dirname, '..');   // tools/
export const ROOT = path.resolve(TOOLS_DIR, '..');        // ワークスペース直下
export const DEFAULT_CONFIG = path.join(TOOLS_DIR, 'convert.config.json');

/**
 * convert.config.json を読み込み、相対パスを絶対パスへ解決して返す。
 * configPath 省略時は tools/convert.config.json を使う。
 * cfg.mockDir / publicDir / buildDir は「ワークスペース直下からの相対」を前提とし、
 * 解決済み絶対パスを cfg.mockDirAbs / publicDirAbs / buildDirAbs として付与する。
 */
export function loadConfig(configPath) {
  const p = configPath ? path.resolve(configPath) : DEFAULT_CONFIG;
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  cfg.configPath = p;
  cfg.mockDirAbs = path.resolve(ROOT, cfg.mockDir);
  cfg.publicDirAbs = path.resolve(ROOT, cfg.publicDir);
  cfg.buildDirAbs = path.resolve(ROOT, cfg.buildDir);
  return cfg;
}
