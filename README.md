# CMS フロント制作パイプライン（cms-front-pipeline）

Claude Design の自己展開バンドル HTML を、**共通コア CMS 用の静的 HTML ＋ PHP フロント**へ変換する制作用パイプライン。CMS エンジン（cms-core）や各案件リポ（`site/`）の **外**に置き、**案件横断で使い回す**ツール群。**依存なし・Node 標準モジュールのみ**で動く。

> このリポジトリは「制作（ビルド）環境」であり、稼働するサイト本体ではない。実際に動くのは変換の成果物（各案件の `public/`）で、そちらは各案件リポ（`site/`）側で管理・デプロイする。

---

## リポジトリの範囲（追跡 / 除外）

| 区分 | 対象 | 備考 |
|---|---|---|
| **追跡** | `tools/`（パイプライン本体）、`package.json`、`README.md`、`.gitignore`、`CLAUDE.md`、`handoff_*.md` | パイプラインとプロジェクト文書 |
| **除外**（`.gitignore`） | `site/` | CMS本体＝独立 git リポジトリ（ネスト回避のため除外） |
| | `build/` | 変換の中間生成物。再生成可能な使い捨て |
| | `mockups/`・`*.bundle` | デザイン原本・重量物。別途アーカイブ保管 |
| | `node_modules/`・`.claude/` | 依存（本来なし）・ローカル設定 |

> ⚠️ **再変換にはデザイン原本 `mockups/` が別途必要**。重量物のため本リポジトリには含めない。デザインアーカイブから取得してワークスペース直下へ置くこと。

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
| `lib/config.mjs` | `convert.config.json` ローダ。パスは **ROOT（本リポジトリ直下）基準**で解決 | 汎用 |
| `convert.bat` / `convert.ps1` | launcher | 汎用 |
| `analyze.mjs` / `dump-content.mjs` | 診断・抽出 | 汎用 |
| `deploy-prep.mjs` / `deploy-prep.bat` | 本番FTP用デプロイツリー生成（配信物からコメント除去。→「本番デプロイ準備」） | 汎用 |
| `build-index.mjs` | `index.php` を組み立てる postBuild フック | **案件固有（花屋）** |
| `convert.config.json` | 案件別設定（`pages`/`font`/`navExtra`/`postBuild`/`publicDir` 等） | **案件固有** |
| `convert.config.sample.json` | `convert.config.json` の書式サンプル | 汎用 |

**横展開時に触るのは基本 `convert.config.json` のみ**。動的ページ用の postBuild（`build-index.mjs`）だけが案件固有。

---

## データの流れ（一方向）

```
mockups/*.html ──[ tools/convert ]──▶ build/（中間生成物）──▶ <publicDir>（最終成果物・実際に動く）
（デザイン原本・入力）    （変換ツール）        （使い捨て）              （各案件 site/public）
                                                                        │
                                              <publicDir> + site/lib ──[ tools/deploy-prep ]──▶ build/deploy/（FTPアップ対象）
```

- **出力先**は `convert.config.json` の `publicDir`（このワークスペースでは `site/public`）。`lib/config.mjs` が ROOT 基準で絶対パスへ解決する。

---

## 重要な挙動

- **アセットは相対パスで出力**：`extract-bundle.mjs` は画像を `assets/img/…`（先頭スラッシュ無し）で出力する。フロント各ページは公開ルート直下に横並びのため、相対にすることで**ルート公開・サブディレクトリ公開（例：既存 WordPress 同居の `/cms/` 配下でのテスト）双方で正しく解決**される。絶対（`/assets/…`）にするとサブディレクトリ配下で親（ルート）側を見に行き当たらない。
- **動的ページは機械変換しない**：`index` / `gallery` 等はマークアップが案件固有のため、手組みするか postBuild フック（花屋は `build-index.mjs`）で組む。
- **既知の制約**：`font` は単一ファミリ前提／`pages` の記述順がフォント・画像の連番採番順（確定後は順序を変えない）／`fonts.css` は先頭ページ canonical・`site.css` は全ページの base CSS を行 union。

---

## 本番デプロイ準備（deploy-prep）※汎用

ソースに残している設計意図コメント（CSS コメント等）を本番へ配信しないため、FTP アップ前に**デプロイツリーを生成**する:

```
npm run deploy-prep        # = node tools/deploy-prep.mjs
tools/deploy-prep.bat      # ダブルクリック / 実行（Windows）
```

`build/deploy/`（毎回作り直し）へ `site/public` → `public/`・`site/lib` → `lib/` をコピーし、次の変換を行う。**FTP では `site/` から直接ではなく、この `build/deploy/` の中身をアップする**（public だけ上げて lib を上げ忘れる事故——未定義関数で全フロント 500——の防止も兼ねる）:

- **`*.css`**：`/* ... */` コメントを除去（`content:"*/"` のような文字列内は誤爆しない）
- **`*.php`**：HTML 領域の `<!-- ... -->` を除去する**安全網**。PHP コード領域（`<?php ... ?>` / `<?= ... ?>`）は触らないため、sitemap.php が echo する診断コメントのような「意図した出力」は保全される。除去が発生すると警告が出る → 規約どおり**ソース側を PHP コメント（`<?php /* ... */ ?>`）へ直す**こと
- **`uploads/`**：画像実体は含めない（本番の実体は管理画面の登録で蓄積される。ローカルの検証用画像で本番を上書きしない）。PHP 実行禁止の `.htaccess` のみ維持
- `config/config.php`・`data/app.sqlite` はツリーに含めない（本番サーバ上で管理する）

> **コメント記述の規約**：テンプレート（`.php`）内の説明・設計意図に HTML コメントを使わない（配信されるため）。PHP コメントで書く。CSS コメントはソースに残してよい（配信物からは本ツールが除去する）。

## 新規案件への流用

1. その案件の `mockups/`（デザイン原本）を用意
2. `convert.config.json` を案件に合わせて調整（`pages`・`font`・`navExtra`・`postBuild`・`publicDir`）
3. `npm run convert`
4. 生成された案件の `public/` を、その案件リポ（`site/`）側で commit・デプロイ

`build-index.mjs` は花屋固有のため、別案件は独自の postBuild を用意するか静的ページのみで構成する。

---

## FAQ（よくあるご質問）の運用 ※案件固有

`site/public/faq.php` は共通コアの汎用 `faq` 種別を **DB参照で動的表示**する（管理画面「よくあるご質問」で追加・編集・並べ替え・下書き化が可能）。本案件は2グループ構成（お花のこと🌸／バルーンのこと🎈）を維持するため、コア標準（handoff_faq_rollout.md §2 は `uses_categories=0`）から**意図的に逸脱**して次の前提で運用する。

- **`faq` 種別は `uses_categories=1`**（カテゴリでグループ分けするため）。
- **カテゴリは2件必須**：`flower`（お花のこと）／`balloon`（バルーンのこと）。**カテゴリの `slug` が前面 `faq.php` の配色・絵文字の対応キー**（`$faq_styles`）になっている。slug を変更すると配色が既定（中立）へフォールバックするため、slug は固定運用とする。
- 並び順は管理画面「よくある質問」一覧の**並び順一括編集**で調整（前面はカテゴリ順→sort_order 順で表示）。
- カテゴリ未選択のまま公開した項目は、前面で末尾「その他のご質問」グループに表示される（無言で消えない安全網）。通常は必ずどちらかのカテゴリを選ぶこと。
- **回答本文の装飾**：DB本文は `sanitize_richhtml()` で `style` が除去されるため、`faq.php` 内のスコープ CSS（`.faq-answer p{…}`）で見た目を再現している。装飾クラス（`fs-*`/`c-*`）以外のインライン style は保存時に落ちる。

> ⚠️ **再 `setup.php` 時の注意**：DBを作り直すとコア seed により `faq` が `uses_categories=0`・カテゴリ0件で復元され、前面が空になる。復旧するには「種別を `uses_categories=1` へ更新」「`flower`・`balloon` の2カテゴリ作成」「Q&A投入」を再実行する。本番/ステージングへの反映手順は **`site/docs/handoff_faq_rollout.md` §1〜§3**（DBバックアップ必須・`setup.php --force` 禁止）に従う。

---

## ギャラリー並び替え（D&D）の運用 ※コア機能反映済み

コア（cms-core `9a7a1a8`）のギャラリー並び替え機能を cherry-pick で反映済み。管理画面「ギャラリー」一覧の**「サムネイルで並び替え」**でカードをドラッグ＆ドロップ→保存すると、前面のギャラリー一覧（`gallery.php`）と**トップページの抜粋6件（`index.php`。案件独自で同順を適用）**が管理画面で決めた順（`contents.sort_order`）で表示される。記事編集画面の画像テーブルも同様にD&Dで並べ替え可能（アイキャッチは並び順に関わらず公開ページの先頭固定）。反映手順の全容は `site/docs/handoff_gallery_dnd_rollout.md` を参照（スキーマ変更・DB作業なし）。

- ⚠️ **新規投稿は一覧の最先頭に出る**：新規記事は `sort_order=0` で保存されるため、一度D&Dで並び替えを保存した後（既存記事が 1..N になった後）に投稿した記事は、前面一覧・トップ抜粋の**最先頭に割り込む**。新規投稿後は「サムネイルで並び替え」で位置を確定させる運用とすること。
- この挙動自体を変えたい場合（新規INSERT時に MAX+1 を振る等）は、案件側で `contents_edit.php` を改変せず **upstream（cms-core）へフィードバック**する（コア資産の改変規律）。
- 本番反映時：アップロード対象はコア8ファイル（`site/docs/handoff_gallery_dnd_rollout.md` 参照）＋案件独自の `index.php`。`admin.css` はキャッシュで新スタイル（⠿ハンドル）が当たらないことがあるためスーパーリロードで確認。

## 詳細ドキュメント

変換の位置づけ・各フォルダの扱い・デプロイ手順の全体像は、CMS 側の設計文書
**`site/docs/rollout_guide.md`**（「制作用フロント資産（mockups / build / tools）の扱い」「本番デプロイ」章）を参照。

## 要件

- Node.js（標準モジュールのみ・追加依存なし）
- 変換自体は PHP / `.htaccess` を必要としない（静的生成のみ）。生成物の動作確認は CMS 側（`php -S` 等）で行う。
