# CLAUDE.md

このファイルは、本プロジェクトで作業する際に Claude（および開発者）が従うガイドラインです。

## プロジェクト概要

静的サイト（HTML/CSS/JS + PHP）向けの、案件横断で流用する自作管理エンジン（共通コア CMS）。
WordPress・外部CMSは使わず、共用レンタルサーバ（Xserver等）上で動作させる。

- **フロントエンド**：静的HTML + 動的ページのみ `.php`（SQLiteを直接クエリ）
- **管理画面**：自作PHP + SQLite の admin panel
- **DB**：SQLite（PDO経由・プリペアドステートメント必須）
- **コンテンツモデル**：単一の `contents` テーブルに `type_slug` で種別を持たせる汎用設計

詳細は `docs/core_schema_design.md` および `sql/01_schema.sql` を参照。

## 基本原則

以下は本プロジェクトで必ず守る原則です。

### 1. 言語（日本語を原則とする）
- **応答**：日本語で行う。
- **ソース内コメント**：日本語で記述する。
- **出力（成果物・ドキュメント）**：日本語で作成する。

### 2. ソースコード内コメント
- 処理の意図・設計判断の理由を、適宜コメントとして残す。
- 「何をしているか」だけでなく「なぜそうしているか」を補う。
- 特にセキュリティ上の理由（エスケープ・プレースホルダ・CSRF等）や、SQLiteの仕様依存（`PRAGMA foreign_keys` など）は必ず明記する。

### 3. 共通化を意識する
- 案件横断で流用することが前提。案件固有のロジックは共通コアに持ち込まない。
- 種別追加はデータ追加（`content_types` に1行INSERT）で吸収し、スキーマ変更やコード分岐の増殖を避ける。
- 繰り返し処理は `lib/` の共通処理（db / auth / csrf / sanitize / upload / media / layout / front / mailer / form）へ集約する。
- デザイン・フロントエンドのみ案件ごとに差し替える設計を維持する。

### 4. プラン作成時のレビュー
- プラン作成時はサブエージェントを使ってレビューを実施し、実装OKの判断が出るまでレビューを繰り返す
- レビューの結果はユーザに示すこと

### 5. 実装完了時のドキュメント反映
- 実装が完了したら、関連ドキュメントを必ず更新する。
  - 設計変更 → `docs/core_schema_design.md`
  - スキーマ変更 → `sql/01_schema.sql`（`schema_meta.schema_version` の更新判定も検討）
  - セットアップ・運用手順の変更 → `README.md`
- ドキュメントと実装の乖離を残さない。

### 6. Git管理
- ソースは Git で管理する。
- **コミットしないもの**：`config/config.php`（実値）、`data/app.sqlite`、アップロード画像実体など。設定は `config.sample.php` のみコミットする。
- 認証情報・個人情報をコミット・ログ・出力に残さない。

### 7. 不明点は必ず確認する
- 仕様・設計判断で不明な点があれば、成果物を生成する前に必ず確認する。
- 大きな設計判断（DBエンジン選定、連携方式、スキーマ構造など）は段階的に確認してから反映する。
- 推測で進めず、確認 → 合意 → 実装 の順を守る。

## セキュリティ要点（必須）

- SQLは必ずプレースホルダを使う（文字列連結でSQLを組み立てない）。
- 出力は必ずエスケープ（`h()` 経由）する。
- 状態変更フォームには CSRF トークンを付与（`csrf_field()` / `csrf_verify()`）。
- 本文は保存時に `sanitize_richhtml()` で許可タグのみへ正規化。表示側でも `h()` で最終防御。
- 画像アップロードは拡張子ホワイトリスト + MIME実体 + サイズ検証 + サーバ側リネーム。保存先は PHP実行禁止。
- 管理画面は本番でHTTPS必須。

## コーディング規約

- **言語**：PHP 8.x
- **DB接続**：接続直後に必ず `PRAGMA foreign_keys = ON;` を実行する（SQLiteは接続ごとに必要）。
- **日時**：ISO8601文字列（`datetime('now','localtime')`）で統一する。
- **文字コード**：UTF-8。

## 成果物・ドキュメントに関する注意

- 成果物・ドキュメント類に**特定の会社名を含めない**こと。汎用的に流用できる形で作成する。

## ディレクトリ構成

共通コア CMS 本体は **`cms-core/`（独立 git リポジトリ）** 配下にある。ワークスペース直下には、これに加えてフロント制作用のビルドパイプライン（`tools/` `build/` `mockups/`。**コアリポ外**）が置かれる。

```
（ワークスペース直下）
cms-core/   … 共通コア CMS 本体（独立 git リポジトリ）
  config/   … 設定（config.sample.php をコピーして config.php を作成。実値はコミットしない）
  lib/      … 共通処理（db / auth / csrf / sanitize / upload / media / layout / front / mailer / form）
  public/   … 公開ルート（php -S のドキュメントルート）
    admin/  … 管理画面（+ admin/assets/：管理画面用JS。全ローカル資産）
    parts/  … フロント共通パーツ（header.php / footer.php）※案件ごとに差し替え
    assets/ … デザイン資産（css / fonts / img）※案件ごとに差し替え
    uploads/… 画像実体（.htaccess でPHP実行禁止） + thumbs/
    *.php   … フロント各ページ（index.php など）※案件ごとに差し替え
  data/     … app.sqlite（コミットしない）
  sql/      … 01_schema.sql / 02_sample_data.sql / setup.php
  docs/     … 設計書・手順書（core_schema_design.md / contact_form_design.md / rollout_guide.md / review_admin_20260712.md）
tools/ build/ mockups/ … フロントのビルドパイプライン（コアリポ外・案件制作用）
```

## 横展開の運用モデル

- **方式**：`cms-core` を汎用ひな形（upstream）とし、新規案件は複製 → **案件資産のみ差し替え**る。core の改善は各案件へ `git fetch upstream && git merge`（または cherry-pick）で opt-in 反映する。
- **コア資産（案件ごとに改変しない）**：`lib/`・`public/admin/`・`sql/`・`config/config.sample.php`。改変が必要なら案件側で上書きせず upstream へフィードバックする（この規律が守られている限り `git merge upstream` の衝突はコア側に限定される）。
- **案件資産（案件ごとに差し替え）**：`public/` フロント各ページ・`public/parts/`・`public/assets/`・`config/config.php`（実値）・`data/app.sqlite`・`public/uploads/` 実体。
- 新規案件の立ち上げ〜本番公開の具体手順は **`docs/rollout_guide.md`** を参照。
