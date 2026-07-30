# CLAUDE.md（案件ワークスペース）

このファイルは、本案件で作業する際に Claude（および開発者）が従うガイドラインです。

> 次の項目は `dev/CLAUDE.md`（親ディレクトリ）側に一本化しており、本ファイルには重複させていません。
> 言語／応答と成果物の長さ／スコープの扱い／サブエージェントの使い方／作業中の報告／
> コメントの書き分け（HTML・CSS・PHP）／2リポ横展開モデルとマージ手順／モデル別の挙動調整。

## プロジェクト概要

静的サイト（HTML/CSS/JS + PHP）向けの、案件横断で流用する自作管理エンジン（共通コア CMS）を
本案件向けに展開したワークスペース。WordPress・外部CMSは使わず、共用レンタルサーバ（Xserver等）上で動作させる。

- **フロントエンド**：静的HTML + 動的ページのみ `.php`（SQLiteを直接クエリ）
- **管理画面**：自作PHP + SQLite の admin panel（cms-core と同一。案件で改変しない）
- **DB**：SQLite（PDO経由・プリペアドステートメント必須）
- **コンテンツモデル**：単一の `contents` テーブルに `type_slug` で種別を持たせる汎用設計

設計・スキーマの詳細は `site/docs/core_schema_design.md` および `site/sql/01_schema.sql` を参照（いずれも読み取り専用扱い。後述「資産の区分」）。

## ディレクトリ構成

CMS 本体は **`site/`**（cms-core のクローン。origin=案件 / upstream=cms-core、upstream への push は DISABLED）。
ワークスペース直下には、これに加えてフロント制作用のビルドパイプライン（**コアリポ外**）が置かれる。

```
（案件ワークスペース直下 = dev/{案件名}/）
site/         … CMS 本体（cms-core のクローン）
  config/     … config.sample.php（コア資産）+ config.php（案件・非コミット）
  lib/        … 共通処理（db / auth / csrf / sanitize / upload / media / layout / front / mailer / form）
  public/     … 公開ルート（php -S のドキュメントルート）
    admin/    … 管理画面（+ admin/assets/）※cms-core と同一
    parts/    … フロント共通パーツ（header.php / footer.php）※案件固有
    assets/   … デザイン資産（css / fonts / img）※案件固有
    uploads/  … 画像実体（.htaccess でPHP実行禁止）+ thumbs/ ※案件固有
    *.php     … フロント各ページ（index.php など）※案件固有
  data/       … app.sqlite ※案件固有・非コミット
  sql/        … 01_schema.sql / 02_sample_data.sql / setup.php
  docs/       … 設計書・手順書（core_schema_design.md / contact_form_design.md / rollout_guide.md / review_admin_20260712.md）
  README.md   … コアの README
tools/ build/ mockups/  … フロント制作のビルドパイプライン（コアリポ外・案件固有）
README.md               … 案件固有のメモ（独自ドメイン・デプロイ先・引き継ぎ事項）
package.json            … ビルドパイプライン用
```

## 資産の区分（最重要）

`site/` 配下はコア資産と案件資産が混在している。**どちらに属するかを確認してから編集すること。**

| 区分 | 対象 | 案件側での扱い |
|---|---|---|
| **コア資産** | `site/lib/`・`site/public/admin/`・`site/sql/`・`site/docs/`・`site/config/config.sample.php`・`site/README.md` | **編集しない**。改善が必要なら cms-core 側で対応し、マージで取り込む |
| **案件資産** | `site/public/parts/`・`site/public/assets/`・`site/public/*.php`（フロント各ページ） | 案件ごとに差し替える |
| **案件データ** | `site/config/config.php`（実値）・`site/data/app.sqlite`・`site/public/uploads/` の実体 | 案件ごと。コミットしない |
| **制作パイプライン** | 案件直下の `tools/`・`build/`・`mockups/`・`README.md`・`package.json` | 案件固有（コアリポ外） |

- コア資産を案件側で上書きすると `git merge upstream` が衝突する。この規律が守られている限り、衝突はコア側に限定される。
- **コア資産に該当する変更は案件側で行わない。** 上表で分類し、コア資産に当たる場合は変更内容を提案して止まること。

## 基本原則

### 1. ソースコード内コメント
- 処理の意図・設計判断の理由を、適宜コメントとして残す。
- 「何をしているか」だけでなく「なぜそうしているか」を補う。
- 特にセキュリティ上の理由（エスケープ・プレースホルダ・CSRF等）や、SQLiteの仕様依存（`PRAGMA foreign_keys` など）は必ず明記する。
- 一方で、**自明な処理に説明コメントを付けない**。コード量に対してコメントが過剰にならないようにする。

### 2. 共通化を意識する
- 案件横断で流用することが前提。案件固有のロジックを共通コアに持ち込まない。
- 種別追加はデータ追加（`content_types` に1行INSERT）で吸収し、スキーマ変更やコード分岐の増殖を避ける。
- 繰り返し処理は `site/lib/` の共通処理へ集約する。ただし `site/lib/` はコア資産のため、案件側では直接編集せず cms-core 側での対応を提案する。
- デザイン・フロントエンドのみ案件ごとに差し替える設計を維持する。

### 3. プラン作成時のレビュー（適用条件）
以下のいずれかに該当する場合、`plan-reviewer` でレビューを実施する。実施要領は `dev/CLAUDE.md`「サブエージェントの使い方」に従う。

- DB スキーマの変更を伴う
- コア資産（`site/lib/`・`site/public/admin/`・`site/sql/`）に関わる変更を含む
- 複数ファイルにまたがる機能追加

### 4. ドキュメントの扱い
- **案件側でコアのドキュメント（`site/docs/`・`site/sql/`・`site/README.md`）を更新しない。** いずれもコア資産。
- 設計・スキーマ・運用手順の変更が必要になった場合は、cms-core 側で修正 → commit/push → 案件側で `git fetch upstream && git merge` して取り込む。案件セッションでは、必要な変更内容を提案して止まること。
- 案件固有の記録（独自ドメイン・デプロイ先・引き継ぎ事項）は、**案件直下の `README.md`** 等へ書く。
- 該当する変更が無ければ、この項目について何も出力しない。

### 5. Git管理
- `site/` は origin=案件 / upstream=cms-core。**upstream への push は行わない**（DISABLED）。
- **コミットしないもの**：`site/config/config.php`（実値）、`site/data/app.sqlite`、`site/public/uploads/` の画像実体。
- 認証情報・個人情報をコミット・ログ・出力に残さない。

### 6. 不明点の扱い
- **大きな設計判断**（外部連携方式、スキーマ構造、認証方式など、後から変えにくいもの）は、推測で進めず **確認 → 合意 → 実装** の順を守る。段階的に確認してから反映する。
- 一方、**解釈が分かれても成果物が大きく変わらない点は自分で判断して進める**。判断した内容は作業後に一文で伝えればよい。
- 不明点があっても、まず既存コード・設計書から読み取れる前提を整理し、それでも決まらない場合にのみ確認する。
- 確認する場合は質問を並べ立てず、最も影響の大きい1〜2点に絞ること。

## セキュリティ要点（必須）

- SQLは必ずプレースホルダを使う（文字列連結でSQLを組み立てない）。
- 出力は必ずエスケープ（`h()` 経由）する。
- 状態変更フォームには CSRF トークンを付与（`csrf_field()` / `csrf_verify()`）。
- 本文は保存時に `sanitize_richhtml()` で許可タグのみへ正規化。表示側でも `h()` で最終防御。
- 画像アップロードは拡張子ホワイトリスト + MIME実体 + サイズ検証 + サーバ側リネーム。保存先は PHP実行禁止。
- 管理画面は本番でHTTPS必須。

## コーディング規約

- **言語**：PHP 8.x
- **DB接続**：接続直後に必ず `PRAGMA foreign_keys = ON;` を実行する（SQLiteは接続ごとに必要）。`db()` 以外で直接接続しない。
- **日時**：ISO8601文字列（`datetime('now','localtime')`）で統一する。
- **文字コード**：UTF-8。

## 成果物・ドキュメントに関する注意

- 成果物・ドキュメント類に**特定の会社名・顧客名を含めない**こと。汎用的に流用できる形で作成する。
  - 案件固有の顧客名・ドメイン等は、案件直下の `README.md` に限って記載してよい。
- 新規案件の立ち上げ〜本番公開の具体手順は **`site/docs/rollout_guide.md`** を参照。
