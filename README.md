# CMS フロント制作パイプライン（cms-front-pipeline）

Claude Design の自己展開バンドル HTML を、**共通コア CMS 用の静的 HTML ＋ PHP フロント**へ変換する制作用パイプライン。CMS エンジン（cms-core）や各案件リポの **外**に置き、**案件横断で使い回す**ツール群。**依存なし・Node 標準モジュールのみ**で動く。

> このリポジトリは「制作（ビルド）環境」であり、稼働するサイト本体ではない。実際に動くのは変換の成果物（各案件リポの `public/`）で、そちらは案件リポ側で管理・デプロイする。

3リポ（`cms-core` / `cms-front-pipeline` / 案件リポ）は **`workspace/CMS/` 直下に並列**で置く（互いにネストしない）。本リポから案件リポは `../{案件名}/` で指す。

```
workspace/CMS/
  cms-core/            … CMSエンジンの upstream
  cms-front-pipeline/  … 本リポ（mockups/ build/ もこの直下）
  {案件名}/             … 案件リポ（変換の出力先 ../{案件名}/public）
```

---

## リポジトリの範囲（追跡 / 除外）

**追跡するのは汎用ツールと雛形のみ**。案件固有物は追跡しない（`cms-core` が `config.php` を追跡せず `config.sample.php` だけを配るのと同じ流儀）。

| 区分 | 対象 | 備考 |
|---|---|---|
| **追跡** | `tools/`（`convert.config.json`・`project/` を除く）、`package.json`、`README.md`、`.gitignore`、`CLAUDE.md` | 汎用ツールと雛形 |
| **除外**（`.gitignore`） | `tools/convert.config.json` | 案件別設定。`convert.config.sample.json` をコピーして作る |
| | `tools/project/` | 案件固有の postBuild フック（汎用化不可） |
| | `handoff_*.md` | 引き継ぎ文書。案件リポの `docs/` へ収容するか都度手渡し |
| | `build/` | 変換の中間生成物。再生成可能な使い捨て |
| | `mockups/`・`*.bundle` | デザイン原本・重量物。別途アーカイブ保管 |
| | `node_modules/`・`.claude/` | 依存（本来なし）・ローカル設定 |

> ⚠️ **再変換にはデザイン原本 `mockups/` が別途必要**。重量物のため本リポジトリには含めない。デザインアーカイブから取得して本リポジトリ直下へ置くこと。

---

## 実行方法

いずれか1つで完走する（挙動は `tools/convert.config.json` が駆動）:

```
npm run convert            # = node tools/convert.mjs
tools/convert.bat          # ダブルクリック / 実行（Windows）
pwsh tools/convert.ps1     # PowerShell
```

補助コマンド: `npm run analyze`（診断レポート）／`npm run dump`（コンテンツ抽出）。

---

## tools/ の構成

| ファイル | 役割 | 区分 |
|---|---|---|
| `convert.mjs` | オーケストレータ。`extract-bundle` 実行後、`convert.config.json` の `postBuild` フックを順に呼ぶ | 汎用 |
| `extract-bundle.mjs` | 設定駆動の変換本体（アセット/フォント/CSS/断片/静的 `.php` を生成） | 汎用 |
| `lib/config.mjs` | `convert.config.json` ローダ。パスは **ROOT（本リポジトリ直下）基準**で解決。postBuild フックは `TOOLS_DIR`（`tools/`）基準で解決するため `project/xxx.mjs` のようなサブディレクトリ指定も可 | 汎用 |
| `convert.bat` / `convert.ps1` | launcher | 汎用 |
| `analyze.mjs` / `dump-content.mjs` | 診断・抽出 | 汎用 |
| `deploy-prep.mjs` / `deploy-prep.bat` | 本番FTP用デプロイツリー生成（配信物からコメント除去。→「本番デプロイ準備」） | 汎用 |
| `project/*.mjs` | 動的ページを組み立てる postBuild フック（例 `project/build-index.mjs`） | **案件固有・追跡外** |
| `convert.config.json` | 案件別設定（`pages`/`font`/`navExtra`/`postBuild`/`publicDir` 等） | **案件固有・追跡外** |
| `convert.config.sample.json` | `convert.config.json` の書式サンプル | 汎用 |

**横展開時に触るのは基本 `convert.config.json` のみ**。動的ページ用の postBuild（`tools/project/` 配下）だけが案件固有で、いずれも追跡外。

---

## データの流れ（一方向）

```
mockups/*.html ──[ tools/convert ]──▶ build/（中間生成物）──▶ <publicDir>（最終成果物・実際に動く）
（デザイン原本・入力）    （変換ツール）        （使い捨て）           （../{案件名}/public）
                                                                        │
                                    <publicDir> + ../{案件名}/lib ──[ tools/deploy-prep ]──▶ build/deploy/{案件名}/（FTPアップ対象）
```

- **出力先**は `convert.config.json` の `publicDir`（隣に並ぶ案件リポ＝`../{案件名}/public`）。`lib/config.mjs` が ROOT 基準で絶対パスへ解決する。

---

## 重要な挙動

- **アセットは相対パスで出力**：`extract-bundle.mjs` は画像を `assets/img/…`（先頭スラッシュ無し）で出力する。フロント各ページは公開ルート直下に横並びのため、相対にすることで**ルート公開・サブディレクトリ公開（例：既存 WordPress 同居の `/cms/` 配下でのテスト）双方で正しく解決**される。絶対（`/assets/…`）にするとサブディレクトリ配下で親（ルート）側を見に行き当たらない。
- **動的ページは機械変換しない**：`index` / `gallery` 等はマークアップが案件固有のため、手組みするか postBuild フック（`tools/project/` 配下）で組む。
- ⚠️ **再変換は `publicDir` 配下を上書きする**：案件リポの `public/` を手で改修している場合（レスポンシブ対応の `site.css`・静的ページ・`index.php` 等）、再変換で失われる。実行前に改修の再適用方針を決めること。`parts/header.php`・`parts/footer.php` はパイプライン生成外なので影響しない。
- **既知の制約**：`font` は単一ファミリ前提／`pages` の記述順がフォント・画像の連番採番順（確定後は順序を変えない）／`fonts.css` は先頭ページ canonical・`site.css` は全ページの base CSS を行 union。

---

## 本番デプロイ準備（deploy-prep）※汎用

ソースに残している設計意図コメント（CSS コメント等）を本番へ配信しないため、FTP アップ前に**デプロイツリーを生成**する:

```
npm run deploy-prep        # = node tools/deploy-prep.mjs
tools/deploy-prep.bat      # ダブルクリック / 実行（Windows）
```

`build/deploy/{案件名}/`（毎回作り直し）へ `<publicDir>` → `public/`・その親の `lib/` → `lib/` をコピーし、次の変換を行う（`publicDir` の親ディレクトリ＝案件リポ直下を自動で辿り、そのディレクトリ名を `{案件名}` に使う）。**FTP では案件リポから直接ではなく、この `build/deploy/{案件名}/` の中身をアップする**（public だけ上げて lib を上げ忘れる事故——未定義関数で全フロント 500——の防止も兼ねる）:

- **`*.css`**：`/* ... */` コメントを除去（`content:"*/"` のような文字列内は誤爆しない）
- **`*.php`**：HTML 領域の `<!-- ... -->` を除去する**安全網**。PHP コード領域（`<?php ... ?>` / `<?= ... ?>`）は触らないため、sitemap.php が echo する診断コメントのような「意図した出力」は保全される。除去が発生すると警告が出る → 規約どおり**ソース側を PHP コメント（`<?php /* ... */ ?>`）へ直す**こと
- **`uploads/`**：画像実体は含めない（本番の実体は管理画面の登録で蓄積される。ローカルの検証用画像で本番を上書きしない）。PHP 実行禁止の `.htaccess` のみ維持
- `config/config.php`・`data/app.sqlite` はツリーに含めない（本番サーバ上で管理する）

出力パスに案件名が入るため、**FTP でアップロード元を選ぶ時点で対象案件を確認できる**（横展開で複数案件を並行して準備しても取り違えない）。削除・再生成の対象も自案件のサブツリーだけで、他案件の準備済みツリーは残る。実行ログの `対象案件` / `コピー元` 行でも対象を確認できる。

> ⚠️ FTP は**削除同期（ミラーリング）を使わない**こと。`uploads/` に画像実体を含めないため、同期削除すると本番の登録画像が消える。

> **コメント記述の規約**：テンプレート（`.php`）内の説明・設計意図に HTML コメントを使わない（配信されるため）。PHP コメントで書く。CSS コメントはソースに残してよい（配信物からは本ツールが除去する）。

## 新規案件への流用

1. `tools/convert.config.sample.json` をコピーして `tools/convert.config.json` を作る（追跡外）
2. その案件の `mockups/`（デザイン原本）を本リポジトリ直下へ用意
3. `convert.config.json` を案件に合わせて調整（`publicDir` は隣に clone した `../{案件名}/public`。ほか `pages`・`font`・`navExtra`・`postBuild`）
4. `npm run convert`
5. 生成された案件の `public/` を、その案件リポ側で commit・デプロイ

動的ページ用の postBuild フックは案件ごとに `tools/project/` へ用意する（追跡外）。静的ページのみで構成するなら `postBuild` は `[]` でよい。

---

## 詳細ドキュメント

変換の位置づけ・各フォルダの扱い・デプロイ手順の全体像は、CMS 側の設計文書
**`cms-core/docs/rollout_guide.md`**（「制作用フロント資産（mockups / build / tools）の扱い」「本番デプロイ」章）を参照。案件リポにも同じファイルが upstream マージで配られる。

案件固有の運用メモ（FAQ のカテゴリ運用、ギャラリー並び替えの運用など）は本リポジトリに置かず、案件リポの `docs/` 側で管理する。

## 要件

- Node.js（標準モジュールのみ・追加依存なし）
- 変換自体は PHP / `.htaccess` を必要としない（静的生成のみ）。生成物の動作確認は CMS 側（`php -S` 等）で行う。
