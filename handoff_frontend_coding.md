# 引き継ぎ：自作CMS フロント（表示側）コーディング スレッド

> このドキュメントは **Claude Code 上でフロント（サイト表示側）を実装する** ためのハンドオフです。
> 共通コアの管理エンジン本体は別スレッドで実装・検証済み。本スレッドはその成果物に接続します。
> 回答は日本語。断定できない点は「推測」と明示すること。成果物・ドキュメントに会社名を含めないこと。

---

## 0. このスレッドの位置づけ（分割型運用）

機能領域ごとにスレッドを分割する運用。本スレッドは **フロント（静的サイト＋一部PHP動的化）** に集中する。

### このスレッドで作る（IN SCOPE）
- **① バンドル変換**：配布用モックHTML（自己展開バンドル・各8〜9MB）→ 通常の静的HTML＋外部アセット（CSS/JS/画像/フォントを別ファイル化）、**Webフォントのサブセット化**で軽量化。
- **② 動的化テンプレート（.php）**：管理画面が書き込む SQLite を読み、以下を表示。
  - トップの **お知らせ（news）新着** 抜粋
  - トップの **ギャラリー（gallery）** 抜粋（最新数件）
  - **ギャラリー一覧／詳細**（1件＋画像複数）
- 静的ページ（会社/店舗紹介・FAQ・プライバシー等）はDB不要なら **静的HTMLのまま**でよい。

### このスレッドでは作らない（別スレッドへ）
- **管理画面本体**（実装済み。共通コア）
- **問い合わせフォームのPHP実装**（mail送信＋ハニーポット）→「フォーム」スレッド。※contactページの**見た目HTML**は本スレッド、**送信処理PHP**はフォームスレッド。
- **デプロイ／バックアップ／マイグレーション** →「デプロイ」スレッド。

---

## 1. 前提（確定済み）

- 特定サイト専用ではなく複数案件で流用する制作テンプレート（共通コア）。第1弾は花屋案件。
- WordPress 不使用。静的 HTML/CSS/JS ＋ PHP。共用レンタルサーバ（Xserver 等）・PHP 利用可・CI/CDなし・軽量運用。
- DB は SQLite（PDO 経由）。**管理画面（共通コア）は実装完了済み**。
- スタッフが更新するのは **お知らせ（news：テキストのみ）** と **ギャラリー（gallery：写真＋テキスト）**。トップのギャラリー抜粋も最新数件を動的表示。

---

## 2. 共通コア（実装済み）の場所と接続契約 ★最重要★

**プロジェクト**：`C:\Users\198094\Documents\dev\myworkspace\cms-core`（git管理・8コミット済み）

フロントの動的 .php は **新規に接続処理を作らず、共通コアの既存資産を再利用する**こと。

### 再利用する共通ライブラリ（`cms-core/lib/db.php`）
```php
config()            // config/config.php を読む（db_path 等）
db(): PDO           // PDO接続（接続直後に PRAGMA foreign_keys = ON 済み）
db_all($sql,$p)     // 全行取得（プレースホルダ必須）
db_one($sql,$p)     // 1行取得
db_value($sql,$p)   // 単一値
h($s)               // htmlspecialchars(ENT_QUOTES,'UTF-8')。出力は必ず経由
```
- 設定は `cms-core/config/config.php`（`upload_url_base='/uploads'` 等）。
- DB本体は `cms-core/data/app.sqlite`。**管理画面と同じDBを読む**。
- フロントの公開ページは `cms-core/public/` 直下（docroot）に置くのが素直（管理画面は `public/admin/`）。動的ページは `require_once __DIR__ . '/../lib/db.php';` で接続を共有できる。
  - ※ サイトを別docrootにする場合は config/DB のパス解決だけ調整（新規接続コードは書かない）。

### データモデル（`cms-core/docs/core_schema_design.md` / `sql/01_schema.sql`・schema_version=1）
- `content_types`：種別定義。`slug`(news/blog/gallery)・`label`・`uses_images`/`uses_categories`/`uses_tags`・`is_enabled`・`sort_order`。
- `contents`：本体。`type_slug`・`title`・`body`(簡易リッチHTML・**保存時サニタイズ済み**)・`body_format`('rich_html')・`excerpt`・`status`('draft'/'published')・`published_at`(ISO8601 or NULL)・`sort_order`。
- `images`：1コンテンツN枚。`file_path`(表示URL 例 `/uploads/xxxx.jpg`)・`alt`・`caption`・`is_main`(アイキャッチ1枚)・`sort_order`。
  - サムネイルURL規約：`/uploads/thumbs/{basename(file_path)}`（同名でthumbsに生成済み）。
- `categories`(種別ごと)／`tags`(全体共通)／中間 `content_category`・`content_tag`。

### 公開表示の必須クエリ規約
- 公開のみ表示：`status='published' AND (published_at IS NULL OR published_at <= datetime('now','localtime'))`。
- 全SQLは**プレースホルダ**（生連結禁止）。出力は**必ず `h()`**。
- 本文 `body` は保存時にホワイトリストサニタイズ済み。ただし**表示時も**、本文以外の全出力（title/alt/caption等）は `h()` を通す（本文は許可タグを活かすため素出力、それ以外は `h()`）。

#### 参考クエリ（core_schema_design.md §5 準拠）
```php
// トップ：お知らせ新着5件
$rows = db_all(
  "SELECT id,title,published_at FROM contents
    WHERE type_slug='news' AND status='published'
      AND (published_at IS NULL OR published_at <= datetime('now','localtime'))
    ORDER BY COALESCE(published_at, created_at) DESC LIMIT 5");

// ギャラリー詳細（1件＋画像複数）
$item   = db_one("SELECT * FROM contents WHERE id=? AND type_slug='gallery' AND status='published'", [$id]);
$images = db_all("SELECT file_path,alt,caption FROM images WHERE content_id=? ORDER BY is_main DESC, sort_order", [$id]);
```

---

## 3. モックの実態（調査済み） ★方針に直結★

**場所**：`C:\Users\198094\Documents\dev\myworkspace\mockups`（旧 `モック`）

| ファイル | 用途(推測) | サイズ |
|---|---|---|
| `index.html`  | トップ | 約9.3MB |
| `gallery.html`| ギャラリー | 約9.6MB |
| `shop.html`   | 店舗/会社紹介 | 約8.7MB |
| `faq.html`    | よくある質問 | 約8.7MB |
| `privacy.html`| プライバシーポリシー | 約8.7MB |

### 形式：自己展開バンドル（重要）
- 各HTMLは Claude Design の **自己展開バンドル**（`<title>Bundled Page</title>`、`#__bundler_thumbnail` / `Unpacking...` の初期表示、`DOMContentLoaded` で `atob`/`Blob`/`createObjectURL` を使い埋め込みアセット（フォント・画像）を実行時に復元し、DOMをクライアント側で構築）。
- **外部参照ゼロ・要JS**。生HTMLを開いても中身は取り出せない（1ファイルに圧縮・パック済み。base64直書きはほぼ無し＝実行時デコード方式）。
- したがって **静的化＝「ブラウザで展開させた後の実DOMとアセットを抽出」** が必要。単純な文字列抽出では復元不可（推測を含むが、構造から確度高い）。

### 変換の進め方（推奨）
1. 各バンドルを**ローカルのブラウザで開いて展開**（`php -S` でモックを配信 or file://）。展開後の `document` を取得。
2. 展開後DOMから **静的HTML** を書き出し、`data:`／Blob で埋め込まれた **CSS・JS・画像・フォントを外部ファイル化**（`assets/css`・`assets/js`・`assets/img`・`assets/fonts`）。
3. **Webフォントのサブセット化**：日本語フォントは巨大なので、使用文字だけに絞る（推測：`pyftsubset`(fonttools) 等。ツールは環境確認のうえ確定）。`unicode-range`・`font-display:swap` も検討。
4. 画像は適切な形式・サイズへ最適化（`loading="lazy"`・幅指定）。
5. 変換後の静的HTMLを土台に、動的が要るページだけ `.php` 化して §2 のクエリで差し込む。

> ページごとの実セクション（トップにお知らせ枠/ギャラリー枠があるか、contactの有無等）は**展開して現物を確認してから確定**すること（現時点では推測）。

> **【実装済み】** 上記1〜5は `tools/` の変換パイプラインとして実装済み。ブラウザ展開ではなく **Node でバンドルをオフライン復号**する方式に確定した（より頑健）。実行は **`tools/convert.bat` 1発**（`node tools/convert.mjs` / `npm run convert` も可）。案件差し替えは **`tools/convert.config.json` のみ**（`pages`＝ページ構成/`role`＝static・dynamic/`images`＝inline・gallery・none、`font.family`、`navExtra`、`postBuild`。書式は `convert.config.sample.json`）。`extract-bundle` がアセット/CSS/断片/静的.php を生成し、`postBuild` フック（花屋案件は `build-index.mjs`）が動的ページを組み立てる。**動的ページ（index/gallery）は案件固有ゆえ機械変換せず手組み or フック**。既知の制約：フォントは単一ファミリ前提、`pages` の記述順がアセット採番順（確定後は順序固定）。詳細は `cms-core/docs/rollout_guide.md` の「制作用フロント資産の扱い」。

---

## 4. 静的↔動的の切り分け（案・展開後に確定）

| ページ | 変換 | 動的化 |
|---|---|---|
| index | 静的化 | トップに **news新着** ＋ **gallery抜粋** を差し込み → `index.php` |
| gallery | 静的化 | **一覧＋詳細**を `gallery.php`（一覧）／詳細（`?id=` or 個別）で動的表示 |
| shop | 静的化 | DB不要なら静的のまま |
| faq | 静的化 | 当面静的。将来 `content_types` に `faq` 追加で動的化可（既存テーブル変更不要） |
| privacy | 静的化 | 静的のまま |
| contact | （モックに現状なし。要確認） | HTMLは本スレッド、送信PHPは「フォーム」スレッド |

---

## 5. セキュリティ要点（フロント表示側）
- SQLは全プレースホルダ・生連結禁止。出力は `h()`（本文 `body` のみ許可タグを活かす素出力、それ以外は必ず `h()`）。
- 公開判定（status/published_at）を必ず適用。下書きを表示しない。
- 画像は `file_path`（DB値）をそのまま `src` に。ユーザ入力をURL/クエリに直接埋めない。
- 個人情報・認証情報を出力・ログに残さない。本番はHTTPS（デプロイ側担保）。

---

## 6. ディレクトリ配置（案・調整可）
```
cms-core/public/            … docroot
  index.php                 … トップ（静的化＋news/gallery差し込み）
  gallery.php               … ギャラリー一覧/詳細
  shop.html / faq.html / privacy.html … 静的
  assets/
    css/ js/ img/ fonts/    … バンドルから外部化したアセット
  admin/ …（実装済み・共通コア）
  uploads/ …（画像実体・管理画面と共有）
```
- 共通コアの `lib/` `config/` `data/` を再利用（新規接続を作らない）。

---

## 7. 着手順（推奨）
1. モック5ページを**展開・現物確認** → 実セクション・共通パーツ（ヘッダ/フッタ/ナビ）を把握。
2. **バンドル変換①**：静的HTML＋外部アセット化、フォントサブセット化（まず index → 横展開）。
3. 共通パーツをテンプレート化（ヘッダ/フッタ include）。
4. **動的化②**：`index.php`（news/gallery抜粋）→ `gallery.php`（一覧/詳細）。§2の `lib/db.php` を再利用。
5. 表示確認（`php -S localhost:8000 -t public`）：公開/下書きの出しわけ、画像・サムネイル表示、抜粋件数、エスケープ。
6. 「フォーム」「デプロイ」スレッドへ申し送り。

## 8. 動作確認の前提（環境）
- ローカルに PHP 8.3（GD/pdo_sqlite/fileinfo/mbstring 有効）導入済み。`php -S localhost:8000 -t public` で確認可能。
- DB初期化が要る場合：`cms-core` で `php sql\setup.php --force`。

---

## 9. 確認・決定したい点（着手時に整理）
- モック展開後の**実セクション構成**（トップのnews/gallery枠の有無・位置、contactページの有無）。
- 静的のまま/動的化するページの最終確定（faqを将来動的化するか）。
- フォントサブセット化のツール（環境依存・推測段階）。
- ギャラリーURL設計（`gallery.php?id=` かリライトか。共用サーバの `.htaccess` 前提）。

## 10. 参照
- 共通コア設計：`cms-core/docs/core_schema_design.md`、`cms-core/sql/01_schema.sql`
- 共通コアREADME：`cms-core/README.md`（起動・接続・運用）
- 管理エンジンのハンドオフ（前スレッド）：`C:\Users\198094\Downloads\handoff_admin_coding.md`

---

## 11. レスポンシブ対応（2026-07 実施）★再変換時の注意あり★

フロント6ページ（index/gallery/shop/faq/contact/privacy）＋ `parts/header.php`・`parts/footer.php`
をレスポンシブ対応にした。元モックは固定幅（`min-width:1080px`）・全面インライン style で
メディアクエリを持たなかったため、以下の方針で新規実装した。

- **方式**：レイアウトに関わるインライン style（列数・折返し・左右余白・大きな文字/高さ）だけを
  `site/public/assets/css/site.css` 末尾に追加した **`l-` / `u-` クラス**へ移し、メディアクエリで制御。
  色・角丸・影などの装飾はインライン style のまま各ページに残す。`!important` は不使用。
- **ブレークポイント**：`1100px`（ヘッダをハンバーガー化）/ `900px`（2カラム→1カラム・カード4→2列）
  / `560px`（カード2→1列・余白/文字/高さの最小化）。見出し・電話番号は `clamp()` で連続可変。
- **モバイルナビ**：`parts/header.php` に checkbox トグルの **CSS-only ハンバーガー**（JS 不使用）。
  電話リンクは nav の外へ出しモバイルでも常時表示（≤560 は ☎ アイコンのみ）。
  DOM 順「checkbox → label → nav」を崩すと `:checked ~ .l-nav` が効かなくなる点に注意。
- **保全事項**：`site.css` 末尾の「コア本文クラス」ブロック（`.fs-*`/`.c-*`/`--content-accent`）は不変。
  追加クラスはその後ろに区切りコメント付きで追記している。

### ⚠️ 再変換パイプライン（tools/convert.*）との関係
- 現状 `tools/convert.config.json` の **`publicDir` は `"cms-core/public"`**（このワークスペースには
  存在しないパス）を指しているため、`convert` を実行しても **`site/public/` は上書きされない**。
  よって上記レスポンシブ改修（`site/public/` 直接編集）は安全に共存している。
- **ただし将来 `publicDir` を `site/public` に直して再変換すると、`site.css`・静的ページ
  （shop/faq/privacy）・`index.php` は再生成されレスポンシブ改修が失われる**（`parts/header.php`・
  `parts/footer.php` はパイプライン生成外なので影響しない）。再変換が必要になった場合は、
  (a) 変換ツール側にレスポンシブ生成を取り込む、または (b) 再変換後に本改修を再適用すること。
  併せて `publicDir` の値自体を実ディレクトリ（`site/public`）へ修正するか、誤用防止の
  コメントを入れるのが望ましい。
