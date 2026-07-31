// 案件リポの public/ を上書きする前に、対象案件を確認させる。
//
// なぜ convert にだけ確認を入れるのか:
//   deploy-prep の出力は build/ 配下＝作り直せるので取り違えても取り返しがつくが、
//   convert は別リポの成果物（手改修済みの site.css・静的ページ・index.php 等）を
//   直接上書きするため、未コミットの改修が失われる。判断が逆になる。
// なぜ .bat 側ではなくここなのか:
//   起動経路（npm run / node 直叩き / .bat / .ps1）に依存せず必ず通したいため。
//   運用規約では案件名入り config を --config で明示指定するが、指定ミス（別案件の
//   config を渡す）はツールから見て正常な入力であり、目視確認だけが歯止めになる。
import readline from 'node:readline/promises';

/**
 * 案件 public/ への上書き前確認。続行してよければ true。
 * @param {object} cfg loadConfig() が返す設定（projectName / publicDirAbs を使う）
 * @param {{yes?: boolean}} opts yes:true で確認を省略する（--yes 相当）
 */
export async function confirmPublicWrite(cfg, opts = {}) {
  console.log(`対象案件 : ${cfg.projectName}`);
  if (opts.yes) return true;

  // 非TTY（パイプ・リダイレクト・EOF の stdin）では中止する。続行にしない理由は2つ:
  //   1. 取り違えたまま完走させないという本確認の目的に反する。
  //   2. その stdin では rl.question() が解決せず、単体実行は exit 13、
  //      convert.mjs 経由では無言の exit 0（＝.bat が成功メッセージを出す）になる。
  // 通常の起動経路（.bat のダブルクリック・convert.ps1・npm run）はいずれも TTY。
  if (!process.stdin.isTTY) {
    console.error(`[confirm] 対話できない標準入力です。案件「${cfg.projectName}」への上書きを意図するなら --yes を付けて実行してください。`);
    return false;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question(`案件「${cfg.projectName}」の public/ を上書きします。続行しますか? [y/N] `);
  rl.close();

  if (/^y(es)?$/i.test(ans.trim())) return true;
  console.log('中止しました（何も書き込んでいません）。');
  return false;
}
