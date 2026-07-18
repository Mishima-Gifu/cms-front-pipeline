# 引き継ぎ：cms-core に `front_image_url()` を追加（本画像URLの base 追従化）

- **作成日**：2026-07-18
- **作業リポ**：`cms-core`（upstream・独立 git リポジトリ）。**このセッションで完結する core 改善**。
- **発端案件**：花屋案件（`website-flower-balloon-noguchi` / repo は `site/`）。本番WP同居の `/cms/` サブディレクトリでテスト表示する過程で、`upload_url_base` が配置ごとに変わる運用に対し、gallery 本画像だけが追従しない不整合を発見。
- **反映方向**：ここ(cms-core)で修正+commit+push → 後日、案件側で `git fetch upstream && git merge` → 案件側の `gallery.php` を新関数使用へ（案件セッションで実施。本書の対象外）。

---

## 背景（なぜ直すか）

- `images.file_path` は「表示URL（`upload_url_base` + '/' + ファイル名）」を含めて保存する規約（`lib/upload.php` 冒頭コメント・`lib/media.php` 冒頭コメント）。＝保存時の base が焼き込まれる（既知課題 **M-10** の一面）。
- 表示側の不整合：
  - **サムネ**は `lib/front.php::front_thumb_url()` が **現在の `upload_url_base` から再構築**（`base . '/thumbs/' . basename(file_path)`）→ base 変更に追従する。
  - **本画像（フルサイズ）** は案件 gallery 詳細で `file_path` を**生値出力**していた → 保存時 base のまま＝追従しない。
- そのため `upload_url_base` を変える／DB を別配置へ移すと、**サムネは追従するが本画像だけリンク切れ**になり得る。`/cms/` テスト → ルート公開の運用でまさに起こり得る。

## 対応方針

`front_thumb_url()` と**対になるフルサイズ用ヘルパ** `front_image_url()` を `lib/front.php`（コア資産）に追加し、本画像URLも**現在の `upload_url_base` から再構築**する。挙動は正しく保存済みのデータでは不変（＝非破壊）で、base 変更・DB移設に強くなる。

> 恒久対応（`file_path` をファイル名のみ保存へ変更）は M-10 として別管理。本件はその**緩和（表示側の一貫化）**であり、スキーマ変更は伴わない。

---

## 変更内容（1ファイル）

### `lib/front.php`
`front_thumb_url()` の**直後**（`front_not_found()` の前）に以下を追加：

```php
/**
 * 画像の本体（フルサイズ）表示URLを組み立てる。
 * 規約：upload_url_base . '/' . basename(file_path)
 *       （サムネ front_thumb_url と対。'/thumbs/' を挟まないフルサイズ版）。
 * 保存済み file_path に焼き込まれた base をそのまま使わず、現在の upload_url_base から
 * 再構築することで、upload_url_base の変更・DBの別配置への移設に追従する（M-10 の緩和）。
 */
function front_image_url(string $filePath): string
{
    $base = rtrim((string) config('upload_url_base'), '/');
    return $base . '/' . basename($filePath);
}
```

### 中立プレースホルダ gallery の確認（あれば同時に）
cms-core の**中立フロント**（`public/gallery.php` 等）に本画像を生 `file_path` 出力している箇所があれば、同じく `front_image_url()` 経由へ直す。→ これで**将来クローンが最初から規約を継承**する。案件固有の文言・配色には触れない（中立のまま）。

---

## cms-core の作業手順（このセッション）

1. **プランレビュー**（cms-core の CLAUDE.md 方針に従う）：小さな追加だが、着手前に plan-reviewer 等で軽くレビューし結果を残す。
2. `lib/front.php` に `front_image_url()` を追加。
3. 中立 `public/gallery.php`（あれば）の本画像を `front_image_url()` 経由へ。
4. **セキュリティ確認**：出力側は呼び出し元で `h()` を通す前提（この関数自体はURL文字列を返すだけ。`basename()` でパストラバーサル成分は落ちる）。SQL・CSRF には無関係。
5. **ドキュメント反映**（cms-core CLAUDE.md ルール5）：`front_thumb_url` が言及されている箇所（設計書/READMEのフロント規約）に `front_image_url` も併記。M-10 台帳（`docs/review_admin_20260712.md`）に「表示側の一貫化を front_image_url で緩和済み。恒久対応（ファイル名のみ保存）は未対応のまま」を追記。
6. ローカル確認：`php -S localhost:8000 -t public` で gallery 詳細の本画像が表示されること（画像入りサンプルDBで）。
7. commit + push（upstream/main）。

### コミットメッセージ例
```
feat(front): 本画像URL用 front_image_url() を追加し base 追従を一貫化

gallery 本画像が保存時 upload_url_base を焼き込んだ file_path を生出力しており、
upload_url_base 変更・DB移設時にサムネ(front_thumb_url)と不整合になる問題を緩和。
現在の upload_url_base から再構築する front_image_url() を追加（M-10 の表示側緩和）。
```

---

## 完了後：案件側フォロー（別セッション・本書の対象外）

cms-core の push 後、花屋案件セッションで：
1. `cd site && git fetch upstream && git merge upstream/main`（`front_image_url()` を取り込み）
2. `site/public/gallery.php:43` を `<img src="<?= h(front_image_url($main['file_path'])) ?>" ...>` へ（案件資産）
3. 検証（詳細ページで本画像・サムネが揃う）

> 順序厳守：関数を取り込む前に案件側で呼ぶと未定義関数で fatal。gallery.php の編集は merge 後。

---

## 参考（根拠ファイル：案件クローン側のパス表記）
- `site/lib/front.php`（`front_thumb_url` 定義。追加位置の基準）
- `site/lib/upload.php` 冒頭・`:129,157`（file_path の格納規約＝base込み）
- `site/lib/media.php` 冒頭（file_path＝表示URLの前提）
- `site/public/gallery.php:43`（本画像 生値出力・案件側で後日修正）/ `:52,110`（サムネ front_thumb_url・追従済み）
