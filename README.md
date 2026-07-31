# CMS フロント制作パイプライン（cms-front-pipeline）

Claude Design の自己展開バンドル HTML を、**共通コア CMS 用の静的 HTML ＋ PHP フロント**へ変換する制作用パイプライン。CMS エンジン（cms-core）や各案件リポの **外**に置き、**案件横断で使い回す**ツール群。**依存なし・Node 標準モジュールのみ**で動く。

> このリポジトリは「制作（ビルド）環境」であり、稼働するサイト本体ではない。実際に動くのは変換の成果物（各案件リポの `public/`）で、そちらは案件リポ側で管理・デプロイする。

3リポ（`cms-core` / `cms-front-pipeline` / 案件リポ）は **`workspace/CMS/` 直下に並列**で置く（互いにネストしない）。本リポから案件リポは `../{案件名}/` で指す。

> 🔰 **実際に手を動かす手順**（準備・実行・確認・FTP アップ・エラー対処）は **[docs/operation_manual.md](docs/operation_manual.md)** にまとめてある。本 README は仕様と設計の根拠を扱う。

```
workspace/CMS/
  cms-core/            … CMSエンジンの upstream
  cms-front-pipeline/  … 本リポ
    tools/             …   汎用ツール（追跡）
    configs/           …   案件別設定 {案件名}.json（雛形 _sample.json のみ追跡）
    mockups/{案件名}/   …   デザイン原本（追跡外）
    build/{案件名}/     …   中間生成物・デプロイツリー（追跡外）
  {案件名}/             … 案件リポ（変換の出力先 ../{案件名}/public）
```

---

## リポジトリの範囲（追跡 / 除外）

**追跡するのは汎用ツールと雛形のみ**。案件固有物は追跡しない（`cms-core` が `config.php` を追跡せず `config.sample.php` だけを配るのと同じ流儀）。

| 区分 | 対象 | 備考 |
|---|---|---|
| **追跡** | `tools/`（`project/` を除く）、`configs/_sample.json`、`package.json`、`README.md`、`docs/`、`.gitignore`、`CLAUDE.md` | 汎用ツールと雛形 |
| **除外**（`.gitignore`） | `configs/*.json`（`_sample.json` を除く） | 案件別設定。`configs/_sample.json` をコピーして `configs/{案件名}.json` を作る |
| | `tools/project/` | 案件固有の postBuild フック（汎用化不可） |
| | `handoff_*.md` | 引き継ぎ文書。案件リポの `docs/` へ収容するか都度手渡し |
| | `build/` | 変換の中間生成物。再生成可能な使い捨て |
| | `mockups/`・`*.bundle` | デザイン原本・重量物。別途アーカイブ保管 |
| | `node_modules/`・`.claude/` | 依存（本来なし）・ローカル設定 |

> ⚠️ **再変換にはデザイン原本 `mockups/` が別途必要**。重量物のため本リポジトリには含めない。デザインアーカイブから取得して本リポジトリ直下へ置くこと。

---

## 実行方法

**案件別設定は `configs/{案件名}.json` に集約し、実行時に `--config` で明示指定する**。既定の設定ファイルは持たない（`--config` 省略時はツールが指定を促して止まる）。これにより「どの案件に対して実行しているか」が常にコマンドへ現れ、指定漏れのまま別案件を上書きすることがない。

```
npm run convert -- --config configs/{案件名}.json     # = node tools/convert.mjs --config …
node tools/convert.mjs --config configs/{案件名}.json
tools/convert.bat --config configs/{案件名}.json      # 引数は素通しされる（処理後 pause）
pwsh tools/convert.ps1 --config configs/{案件名}.json
```

`npm run` 経由では `--` の有無に注意する。`npm run convert --config …` と書くと npm が `--config` を横取りしてツールへ届かない。

**`.bat` のダブルクリック起動は使わない**（`--config` を渡せない）。

変換は案件リポの `public/` を上書きするため、**開始前に対象案件を表示して `[y/N]` を確認する**。確認を省略するには `--yes`（`-y`）を付ける。対話できない標準入力（パイプ・リダイレクト）では中止するので、自動実行では `--yes` が必要。

`node tools/extract-bundle.mjs --config configs/{案件名}.json` の単体実行も可能だが postBuild フックは走らない（動的ページを持つ案件では `convert.mjs` を使う）。

補助コマンド: `npm run analyze`（診断レポート）／`npm run dump`（コンテンツ抽出）。※この2本はページ構成と `mockups/` 直下をハードコードした診断用ツールで、`mockDir` を案件別（`mockups/{案件名}/`）にすると動かない。

---

## ファイル構成

| ファイル | 役割 | 区分 |
|---|---|---|
| `tools/convert.mjs` | オーケストレータ。`extract-bundle` 実行後、設定の `postBuild` フックを順に呼ぶ | 汎用 |
| `tools/extract-bundle.mjs` | 設定駆動の変換本体（アセット/フォント/CSS/断片/静的 `.php` を生成） | 汎用 |
| `tools/lib/config.mjs` | 設定ローダ。`--config` 必須。パスは **ROOT（本リポジトリ直下）基準**で解決。postBuild フックは `TOOLS_DIR`（`tools/`）基準で解決するため `project/xxx.mjs` のようなサブディレクトリ指定も可 | 汎用 |
| `tools/convert.bat` / `convert.ps1` | launcher（引数は素通し） | 汎用 |
| `tools/analyze.mjs` / `dump-content.mjs` | 診断・抽出 | 汎用 |
| `tools/deploy-prep.mjs` / `deploy-prep.bat` | 本番FTP用デプロイツリー生成（配信物からコメント除去。→「本番デプロイ準備」） | 汎用 |
| `tools/project/{案件名}/*.mjs` | 動的ページを組み立てる postBuild フック | **案件固有・追跡外** |
| `configs/{案件名}.json` | 案件別設定（`pages`/`font`/`navExtra`/`postBuild`/`publicDir` 等） | **案件固有・追跡外** |
| `configs/_sample.json` | 案件別設定の書式サンプル（キーの意味・制約はこのファイルの `_doc` に記載） | 汎用 |

**横展開時に触るのは基本 `configs/{案件名}.json` のみ**。動的ページ用の postBuild（`tools/project/` 配下）だけが案件固有で、いずれも追跡外。

---

## データの流れ（一方向）

```
mockups/*.html ──[ tools/convert ]──▶ build/（中間生成物）──▶ <publicDir>（最終成果物・実際に動く）
（デザイン原本・入力）    （変換ツール）        （使い捨て）           （../{案件名}/public）
                                                                        │
                                    <publicDir> + ../{案件名}/lib ──[ tools/deploy-prep ]──▶ build/deploy/{案件名}/（FTPアップ対象）
```

- **出力先**は `configs/{案件名}.json` の `publicDir`（隣に並ぶ案件リポ＝`../{案件名}/public`）。`lib/config.mjs` が ROOT 基準で絶対パスへ解決する（設定ファイルの位置基準ではないため、`configs/` へ移しても値は変わらない）。

---

## 重要な挙動

- **アセットは相対パスで出力**：`extract-bundle.mjs` は画像を `assets/img/…`（先頭スラッシュ無し）で出力する。フロント各ページは公開ルート直下に横並びのため、相対にすることで**ルート公開・サブディレクトリ公開（例：既存 WordPress 同居の `/cms/` 配下でのテスト）双方で正しく解決**される。絶対（`/assets/…`）にするとサブディレクトリ配下で親（ルート）側を見に行き当たらない。
- **動的ページは機械変換しない**：`index` / `gallery` 等はマークアップが案件固有のため、手組みするか postBuild フック（`tools/project/` 配下）で組む。なお `<buildDir>/fragments` は変換のたびに作り直されるため、断片を手編集してそこに残す作業はできない（案件間で断片が混入する事故を防ぐための挙動）。手を入れるなら出力先の `.php` 側か postBuild フックで行う。
- ⚠️ **再変換は `publicDir` 配下を上書きする**：案件リポの `public/` を手で改修している場合（レスポンシブ対応の `site.css`・静的ページ・`index.php` 等）、再変換で失われる。実行前に改修の再適用方針を決めること。`parts/header.php`・`parts/footer.php` はパイプライン生成外なので影響しない。
- **既知の制約**：`font` は単一ファミリ前提／`pages` の記述順がフォント・画像の連番採番順（確定後は順序を変えない）／`fonts.css` は先頭ページ canonical・`site.css` は全ページの base CSS を行 union。

---

## 本番デプロイ準備（deploy-prep）※汎用

ソースに残している設計意図コメント（CSS コメント等）を本番へ配信しないため、FTP アップ前に**デプロイツリーを生成**する:

```
npm run deploy-prep -- --config configs/{案件名}.json
node tools/deploy-prep.mjs --config configs/{案件名}.json
tools/deploy-prep.bat --config configs/{案件名}.json   # 引数は素通しされる
```

convert と同じ設定ファイルを読む（`publicDir` から対象を決める）ため、**ここでも `--config` は必須**。ダブルクリック起動は使わない。

`build/deploy/{案件名}/`（毎回作り直し）へ `<publicDir>` → `public/`・その親の `lib/` → `lib/` をコピーし、次の変換を行う（`publicDir` の親ディレクトリ＝案件リポ直下を自動で辿り、そのディレクトリ名を `{案件名}` に使う）。**FTP では案件リポから直接ではなく、この `build/deploy/{案件名}/` の中身をアップする**（public だけ上げて lib を上げ忘れる事故——未定義関数で全フロント 500——の防止も兼ねる）:

- **`*.css`**：`/* ... */` コメントを除去（`content:"*/"` のような文字列内は誤爆しない）
- **`*.php`**：HTML 領域の `<!-- ... -->` を除去する**安全網**。PHP コード領域（`<?php ... ?>` / `<?= ... ?>`）は触らないため、sitemap.php が echo する診断コメントのような「意図した出力」は保全される。除去が発生すると警告が出る → 規約どおり**ソース側を PHP コメント（`<?php /* ... */ ?>`）へ直す**こと
- **`uploads/`**：画像実体は含めない（本番の実体は管理画面の登録で蓄積される。ローカルの検証用画像で本番を上書きしない）。PHP 実行禁止の `.htaccess` のみ維持
- `config/config.php`・`data/app.sqlite` はツリーに含めない（本番サーバ上で管理する）

出力パスに案件名が入るため、**FTP でアップロード元を選ぶ時点で対象案件を確認できる**（横展開で複数案件を並行して準備しても取り違えない）。削除・再生成の対象も自案件のサブツリーだけで、他案件の準備済みツリーは残る。実行ログの `対象案件` / `コピー元` 行でも対象を確認できる。

> ⚠️ FTP は**削除同期（ミラーリング）を使わない**こと。`uploads/` に画像実体を含めないため、同期削除すると本番の登録画像が消える。

> **コメント記述の規約**：テンプレート（`.php`）内の説明・設計意図に HTML コメントを使わない（配信されるため）。PHP コメントで書く。CSS コメントはソースに残してよい（配信物からは本ツールが除去する）。

## 新規案件への流用

1. `configs/_sample.json` をコピーして **`configs/{案件名}.json`** を作る（追跡外。案件名以外のファイル名にはしない）
2. その案件の `mockups/`（デザイン原本）を **`mockups/{案件名}/`** へ用意する
3. 設定を案件に合わせて調整（`publicDir` は隣に clone した `../{案件名}/public`、`mockDir` は `mockups/{案件名}`、`buildDir` は `build/{案件名}`。ほか `pages`・`font`・`navExtra`・`postBuild`）
4. `npm run convert -- --config configs/{案件名}.json`。表示された対象案件を確認して `y`
5. 生成された案件の `public/` を、その案件リポ側で commit・デプロイ

動的ページ用の postBuild フックは案件ごとに **`tools/project/{案件名}/`** へ用意し、`"postBuild": ["project/{案件名}/build-index.mjs"]` と書く（追跡外）。1階層深くなるため、フック内の import は `../../lib/config.mjs` になる。静的ページのみで構成するなら `postBuild` は `[]` でよい。

**案件ごとに分ける理由**：`mockups/`・`build/fragments/`・`tools/project/` のファイル名はいずれも案件名を含まない。共有すると、次の案件の変換が前案件の残骸（バンドル・断片・フック）を読み、**エラーを出さずに別案件の内容を出力する**。

---

## 詳細ドキュメント

変換の位置づけ・各フォルダの扱い・デプロイ手順の全体像は、CMS 側の設計文書
**`cms-core/docs/rollout_guide.md`**（「制作用フロント資産（mockups / build / tools）の扱い」「本番デプロイ」章）を参照。案件リポにも同じファイルが upstream マージで配られる。

案件固有の運用メモ（FAQ のカテゴリ運用、ギャラリー並び替えの運用など）は本リポジトリに置かず、案件リポの `docs/` 側で管理する。

## 要件

- Node.js（標準モジュールのみ・追加依存なし）
- 変換自体は PHP / `.htaccess` を必要としない（静的生成のみ）。生成物の動作確認は CMS 側（`php -S` 等）で行う。
