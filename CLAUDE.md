# CLAUDE.md（cms-front-pipeline：制作パイプライン）

このファイルは、**制作パイプライン（変換ツール群）そのものを開発・保守する**ときのガイドラインです。

> 次の項目は `workspace/CMS/CLAUDE.md`（親ディレクトリ）側に一本化しており、本ファイルには重複させていません。
> 言語／応答と成果物の長さ／スコープの扱い／サブエージェントの使い方／作業中の報告／
> コメントの書き分け（HTML・CSS・PHP）／3リポ横展開モデルとマージ手順／モデル別の挙動調整。

## このリポジトリの位置づけ

Claude Design の自己展開バンドル HTML を、共通コア CMS 用の**静的アセット＋PHPフロント**へ変換する Node 製ツール群。**案件横断で使い回す upstream** であり、稼働するサイト本体ではない（サーバ上では動かない）。

3リポは `workspace/CMS/` 直下に**並列**で置かれ、互いにネストしない。

```
workspace/CMS/
  cms-core/            … CMSエンジンの upstream（PHP + SQLite）
  cms-front-pipeline/  … 本リポ。mockups/・build/ もこの直下
  {案件名}/             … 案件リポ。変換の出力先は ../{案件名}/public
```

## 最重要：案件固有物を追跡させない

本リポは「**汎用ツール＋雛形のみ**」を追跡する（`cms-core` が `config.php` を追跡せず `config.sample.php` だけを配るのと同じ流儀）。案件固有物が混ざると、2案件目を clone した瞬間に1案件目の設定が初期状態として付いてきて、双方向の上書き競合を起こす。

| 追跡する | 追跡しない（`.gitignore`） |
|---|---|
| `tools/`（汎用ツール・`lib/`・雛形 `convert.config.sample.json`）、`package.json`、`README.md`、`.gitignore`、`CLAUDE.md` | `tools/convert.config.json`（案件別設定）、`tools/project/`（案件固有 postBuild フック）、`handoff_*.md`、`build/`、`mockups/`・`*.bundle`、`node_modules/`、`.claude/` |

- **成果物・ドキュメントに顧客名・案件名を含めない**。案件例が必要なときは `{案件名}` と書く。
- 案件固有の運用メモ・引き継ぎは、案件リポの `docs/` 側へ置く（本リポには残さない）。
- 汎用化できないロジック（HTML 文字列リテラルを直接探して置換する類）は `tools/project/` へ隔離し、`convert.config.json` の `postBuild` から呼ぶ。

## コーディング規約

- **依存を増やさない**。Node 標準モジュールのみで実装する（`npm install` 不要であることがこのツールの前提）。ESM（`.mjs`）で書く。
- **パス解決は cwd 非依存**にする。設定値のパス（`mockDir`/`publicDir`/`buildDir`）は `tools/lib/config.mjs` の `ROOT`（本リポジトリ直下）基準、`postBuild` フックは `TOOLS_DIR`（`tools/`）基準で解決する。新しいツールを足すときもこの2つの基準を使い、相対パスを cwd から解決しない。
- **postBuild フックの契約**：各モジュールは `export function postBuild(cfg)` を提供する。`cfg` には `publicDirAbs` / `buildDirAbs` などの解決済み絶対パスが入っている。
- 処理の意図・設計判断の理由をコメントで補う。自明な処理には付けない。

## 変更時の注意

- **再変換は `publicDir` 配下（＝案件リポの `public/`）を上書きする**。案件側で手作業の改修が入っていると失われるため、出力範囲を広げる変更は影響を明示すること。
- **変換の実機確認にはデザイン原本 `mockups/` が必要**。リポジトリに含まれていないため、手元に無い端末では実行できない。その場合は静的な確認（設定のパス解決・モジュールの import 解決）に留め、実機確認は `mockups/` がある端末へ回す。
- `pages` の記述順はフォント・画像の連番採番順。既存案件の順序を変えるとアセット名がズレる。
- 案件リポ（`{案件名}/`）と `cms-core/` は別リポジトリ。本リポのセッションでは変更しない（変換の出力先を除く）。

## Git管理

- 追跡外のファイル（`convert.config.json`・`tools/project/`・`handoff_*.md`）を `git add -A` で巻き込まないこと。commit 前に `git status` で確認する。
- 認証情報・個人情報をコミット・ログ・出力に残さない。
