# 操作マニュアル（cms-front-pipeline）

デザイン原本から公開用ファイルを作り、FTP でアップできる状態に整えるまでの**実操作の手順書**。
用語の定義や設計上の理由は最小限にとどめ、「どこで・何を・どの順に押すか」を優先して書いてある。
仕様の背景・設計判断を知りたいときは [README.md](../README.md)、CMS 全体の運用は `cms-core/docs/rollout_guide.md` を参照。

> このマニュアル内の `{案件名}` は、実際の案件フォルダ名（案件リポのフォルダ名）に読み替えること。

---

## 0. 最初に知っておくこと（3つだけ）

| 用語 | 意味 |
|---|---|
| **バンドル** | デザインの原本ファイル。`{ページ名}.html` という1枚の HTML に、画像もフォントも全部入っている。`mockups/` に置く |
| **変換（convert）** | バンドルを、Webサーバで動く形（`.php` と `assets/` の画像・CSS・フォント）にバラす作業。このツールの本体 |
| **デプロイ準備（deploy-prep）** | 変換後のファイルを、そのまま FTP に上げられるフォルダへまとめる作業。ソースのコメントを取り除く |

作業の流れは一方向で、**逆流しない**。

```
 デザイン原本            変換ツール          案件リポの public/         FTPアップ用フォルダ
 mockups/{案件名}/  ──▶  convert    ──▶   ../{案件名}/public/   ──▶  build/deploy/{案件名}/
   （入力）                                （出来上がり・実際に動く）   （deploy-prep が作る）
```

⚠️ **変換すると `../{案件名}/public/` の中身は上書きされる。** public/ を手で直したところがあると消える（詳細は §6）。

---

## 1. 事前準備（端末ごとに1回）

### 1-1. Node.js が入っているか確認する

PowerShell を開いて次を実行する。バージョン番号（例 `v20.11.0`）が出れば OK。

```powershell
node -v
```

`'node' は、内部コマンドまたは外部コマンド…として認識されていません` と出たら Node.js が未インストール。
[nodejs.org](https://nodejs.org/) の LTS 版をインストールしてから、PowerShell を**開き直して**もう一度確認する。

> このツールは追加のライブラリを使わないので、`npm install` は不要。Node.js が入っていればそれだけで動く。

### 1-2. フォルダの並びを確認する

3つのフォルダが**横並び**になっていること（入れ子にしない）。

```
Documents\dev\workspace\CMS\
  cms-core\            … CMSエンジン本体
  cms-front-pipeline\  … このツール（ここで作業する）
  {案件名}\             … 案件のフォルダ。ここへ結果が出る
```

案件フォルダがまだ無ければ、先に案件リポを `CMS\` の直下へ clone しておく。

### 1-3. デザイン原本を置く

`cms-front-pipeline\mockups\{案件名}\` を作り、そこへバンドル（`about.html` など）を置く。

```
cms-front-pipeline\
  mockups\
    {案件名}\
      index.html
      about.html
      ...
```

> `mockups\` はサイズが大きいためリポジトリに含まれていない。デザインアーカイブから取得すること。
> **手元に `mockups\` が無い端末では変換できない**（エラーになる）。

⚠️ **案件ごとに必ずサブフォルダを分ける。** `mockups\` 直下に複数案件のファイルを混ぜると、次の案件の変換が前の案件のファイルを読んで、**エラーを出さないまま別案件のデザインを出力する**。

---

## 2. 設定ファイルを作る（案件ごとに1回）

変換の動作は設定ファイル1つで決まる。**設定ファイルは `configs\` フォルダにまとめる**（案件が増えても一覧できる）。

1. `configs\_sample.json` をコピーする
2. コピーしたファイルを **`configs\{案件名}.json`** にリネームする
3. 中身を案件に合わせて書き換える

```
cms-front-pipeline\
  configs\
    _sample.json          … 雛形。コピー元。書き換えない
    {案件名A}.json          … 案件ごとに1ファイル
    {案件名B}.json
```

> 📌 **既定の設定ファイルは無い。実行時に必ず `--config` で案件を指定する。**
> 指定を忘れると処理は始まらず、「設定ファイルが指定されていません」と**その場にある設定の一覧**が表示される。
> そのため、ダブルクリック起動（`convert.bat` / `deploy-prep.bat`）は使わない（`--config` を渡せない）。
> 常に「どの案件に対して実行しているか」がコマンドに現れる状態にしておくのが狙い。

書き換える主な項目：

| 項目 | 何を書くか | 例 |
|---|---|---|
| `mockDir` | バンドルを置いたフォルダ | `"mockups/{案件名}"` |
| `publicDir` | 結果の出力先＝案件リポの public | `"../{案件名}/public"` |
| ↑ | **この親フォルダ名がツール上の「案件名」になる**（確認プロンプトの表示・`build/deploy/{案件名}/` の出力先に使われる。設定ファイルの名前ではない） | |
| `buildDir` | 作業用の一時フォルダ | `"build/{案件名}"` |
| `font.family` | フォントの出力フォルダ名（英数字で任意） | `"noto-sans-jp"` |
| `font.prefix` | フォントファイル名の頭文字（英数字で任意） | `"nsjp"` → `nsjp-000.woff2` |
| `navExtra` | ページ一覧に無いがリンクされる名前 | `["contact"]` |
| `pages` | 変換するページの一覧（**下記**） | |
| `postBuild` | 追加処理。無ければ `[]` のまま | `[]` |

`pages` は、バンドルのファイル名（`.html` を除いた部分）ごとに1行書く。

```json
"pages": {
  "about":   { "title": "私たちについて", "active": "about",   "role": "static",  "images": "inline" },
  "service": { "title": "サービス",       "active": "service", "role": "static",  "images": "none"   },
  "index":   { "title": "トップ",         "active": "home",    "role": "dynamic", "images": "inline" }
}
```

| キー | 選ぶもの |
|---|---|
| `title` | ブラウザのタブと見出しに出るページ名 |
| `active` | ナビゲーションでどのメニューを選択状態にするかのキー |
| `role` | `static` … ページ（`.php`）を自動で作る／`dynamic` … 自動で作らない（トップページやギャラリーなど手組みするページ） |
| `images` | `inline` … 本文の画像を書き出す／`gallery` … ギャラリー用に書き出す／`none` … 画像なし |

⚠️ **`pages` の並び順は、いったん決めたら変えない。** 画像やフォントのファイル名の連番はこの順番で決まるため、
順序を入れ替えると既存のファイル名がズレて、リンク切れの原因になる。ページの追加は末尾に足す。

> 設定ファイルと `tools\project\` は Git の管理対象外（案件固有のため）。バックアップは各自で取ること。

---

## 3. 変換を実行する

### 3-1. PowerShell を開く

`cms-front-pipeline` フォルダで PowerShell を開く（エクスプローラーでフォルダを開き、アドレスバーに `powershell` と入力して Enter でもよい）。念のため今いる場所を確認する。

```powershell
cd C:\Users\{ユーザー名}\Documents\dev\workspace\CMS\cms-front-pipeline
```

### 3-2. 設定ファイルを指定して実行する

まず対象の設定ファイル名を確認する。

```powershell
ls configs
```

**`--config` は必ず付ける**（既定の設定ファイルは無いため、省略すると処理は始まらない）。

```powershell
npm run convert -- --config configs/{案件名}.json
```

`npm run convert` の後ろの **`--` は必須**（これが無いと `--config` が npm 自身のオプションとして解釈され、ツールへ届かない）。

> ファイル名の入力は Tab キー補完を使うと確実。`configs/` まで打って Tab を繰り返し押すと候補が切り替わる。

> 他の実行方法（結果は同じ。使いやすい方でよい）
> - `node tools\convert.mjs --config configs\{案件名}.json` … npm を介さない
> - `tools\convert.bat --config configs\{案件名}.json` … .bat に引数を渡す。処理後に画面が止まる（`pause`）
>
> ❌ `convert.bat` の**ダブルクリックは使わない**。引数を渡せず、設定ファイル未指定で止まる。

### 3-3. 対象案件を確認して `y` を入れる

処理の最初に、どの案件を上書きするかの確認が出る。

```
=== convert start ===
config : ...\configs\{案件名}.json
mock   : ...\mockups\{案件名}
public : ...\{案件名}\public
対象案件 : {案件名}
案件「{案件名}」の public/ を上書きします。続行しますか? [y/N]
```

- **表示された案件名が意図したものか必ず確認する**（`--config` の指定ミスはここで気づける）
- 合っていれば `y` → Enter
- 違っていれば `n` → Enter（`中止しました（何も書き込んでいません）。` と出る。何も壊れていない）

### 3-4. 完了ログを読む

最後まで進むとこう出る。`=== convert done ===` が出ていれば成功。

```
--- extract-bundle ---
fonts: 12 unique woff2 written
images: 24 unique jpg written (inline refs 30, gallery ids 0)
wrote static: about.php / service.php
fragments only (dynamic, hand-authored/postBuild): index

=== convert done ===
```

**閉じる前に `WARN:` で始まる行が無いか確認する**（警告は処理の途中で出るため、完了行より上にある）。出ていたら §7 の警告一覧で対処を確認する。処理自体は完了している。

---

## 4. 出来上がりを確認する

変換で作られるのは、案件リポの `public\` 配下の次のもの。

```
{案件名}\public\
  about.php        … role:"static" のページ（自動生成）
  service.php
  assets\
    css\site.css   … サイト共通のCSS
    css\fonts.css  … フォント定義
    fonts\{family}\ … woff2 フォント
    img\           … 画像
```

`index.php` などの `role:"dynamic"` のページ、`parts\header.php`・`parts\footer.php` は**変換では作られない**（手組み、または追加処理で作る）。

ローカルで表示を確認するときは、案件フォルダで簡易サーバを起動してブラウザで `http://localhost:8000` を開く。

```powershell
php -S localhost:8000 -t public
```

> `php -S` はメール送信と `.htaccess` を扱えない。問い合わせフォームの送信確認・`uploads/` の権限確認は本番サーバで行うこと（`cms-core/docs/rollout_guide.md` 参照）。

確認して問題なければ、**案件リポ側**で `public\` の変更を commit する（このツールのリポでは commit しない）。

---

## 5. デプロイ準備と FTP アップロード

### 5-1. デプロイ用フォルダを作る

変換と同じ設定ファイルを使う。**ここでも `--config` は必ず付ける**（`deploy-prep.bat` のダブルクリックは同じ理由で使わない）。

```powershell
npm run deploy-prep -- --config configs/{案件名}.json
```

確認プロンプトは無く、すぐ処理される（出力先は作り直せる場所なので、取り違えても実害が無いため）。**実行後に `対象案件` の行で案件を確認する。**

```
[deploy-prep] 対象案件: {案件名}
[deploy-prep] コピー元: ...\{案件名}\public
[deploy-prep] 出力: ...\build\deploy\{案件名}
[deploy-prep] CSS 3 ファイルからコメント除去（計 4821 バイト削減）
[deploy-prep] .php に HTML コメントはありません（規約OK）
[deploy-prep] FTP では build/deploy/{案件名}/ の中身（public/・lib/）をアップしてください。
```

`対象案件` と `コピー元` の行で、意図した案件かを確認する。

このツールがやっていること：

- `{案件名}\public\` と `{案件名}\lib\` を `build\deploy\{案件名}\` へコピーする
- CSS のコメント（`/* ... */`）を削除する（ソースには残る。**配信物からだけ**消す）
- `.php` に紛れ込んだ HTML コメント（`<!-- ... -->`）を削除する（保険。出たら §7 参照）
- `uploads\` の画像そのものはコピーしない（本番の登録画像を上書きしないため）
- `config\config.php`・`data\app.sqlite` は含めない（本番サーバ側で管理するもの）

### 5-2. FTP でアップロードする

**アップロード元は `build\deploy\{案件名}\` の中身**（`public\` と `lib\`）。案件フォルダから直接上げない。

> `public\` だけ上げて `lib\` を上げ忘れると、全ページが 500 エラーになる。このフォルダごと上げるのが確実。

⚠️ **FTP の「ミラーリング（同期削除）」は使わないこと。**
`uploads\` の画像を含めていないため、同期削除すると本番に登録済みの画像がすべて消える。

---

## 6. 変換で消えてしまうもの（実行前チェック）

再変換は `{案件名}\public\` を上書きする。以下に心当たりがあれば、**実行前に**バックアップまたは再適用の方法を決めておく。

| 上書きされる | 上書きされない |
|---|---|
| `assets\css\site.css`（手でレスポンシブ対応した場合など） | `parts\header.php`・`parts\footer.php` |
| `role:"static"` のページ（`about.php` など） | `role:"dynamic"` のページで、追加処理を設定していないもの |
| `assets\` 配下の画像・フォント | `uploads\` の登録画像 |

安全策：変換前に案件リポ側で変更を commit しておけば、上書きされても `git diff` で差分を確認し、戻せる。

---

## 7. 困ったときは（メッセージ別の対処）

### エラーで止まる

| 表示 | 原因と対処 |
|---|---|
| `'node' は…認識されていません` | Node.js が未インストール、または PowerShell を開き直していない。§1-1 |
| `convert failed: ENOENT ... mockups\...\{ページ}.html` | 設定 `pages` に書いたページのバンドルが `mockDir` に無い。ファイル名（`.html` を除く）と `pages` のキーを一致させる |
| `convert failed: 設定ファイルが指定されていません。…` | **`--config` を付け忘れた**。続けて表示される「利用できる設定」の一覧から選び、§3-2 の形で指定する |
| `convert failed: ENOENT ... configs\{案件名}.json` | `--config` のパスかファイル名の打ち間違い、または設定ファイルをまだ作っていない（§2）。`ls configs` で実在するファイル名を確認する |
| `convert failed:` に続けて `... in JSON at position ...` と出る | 設定ファイルの JSON が壊れている。末尾の余分なカンマ、閉じ忘れの `}`・`"` を確認 |
| `convert failed: no middle for {ページ}` | そのバンドルが想定の形式でない。デザイン原本が正しいバンドル（自己展開HTML）か確認する |
| `postBuild hook "..." は export function postBuild(cfg) を持っていません` | 追加処理のモジュールの作りが違う。開発者へ連絡 |
| `[confirm] 対話できない標準入力です。…` | 自動実行など、キー入力できない状態で実行した。意図的なら `--yes` を付けて実行する |
| `[deploy-prep] 失敗: 設定ファイルが指定されていません。…` | deploy-prep でも `--config` は必須（§5-1） |
| `[deploy-prep] publicDir が見つかりません: ...` | 変換をまだ実行していない、または `publicDir` の指定が違う |
| `.bat` をダブルクリックしたら「設定ファイルが指定されていません」で終わる | ダブルクリックでは `--config` を渡せないため（§2 の前提）。PowerShell から `--config` 付きで実行する（§3-2・§5-1） |
| `npm warn Unknown cli config "--config"` が出て「設定ファイルが指定されていません」で終わる | `npm run convert --config ...` のように **`--` を忘れている**（npm が `--config` を横取りしてツールへ届いていない）。`npm run convert -- --config ...` と書く |

### 警告（処理は完了している）

| 表示 | 意味と対処 |
|---|---|
| `WARN: {ページ} middle has N leftover UUID(s)` | 画像の置き換えが漏れている。そのページの `images` 設定（`inline`/`gallery`/`none`）が実態と合っているか確認する |
| `WARN: {ページ} font CSS differs from canonical` | ページ間でフォント定義が違う。フォントは先頭ページのものが使われる。表示崩れが無いか確認する |
| `[deploy-prep] ⚠ HTMLコメントを N ファイルで除去しました` | `.php` に `<!-- -->` のコメントが書かれている。配信物からは消えているのでアップロードして問題ないが、**ソース側を PHP コメント（`<?php /* ... */ ?>`）に書き換える**こと（HTML コメントはブラウザから誰でも読めてしまうため） |
| `[deploy-prep] lib/ が見つからないためスキップ` | 案件フォルダに `lib\` が無い。案件リポの clone が不完全な可能性。**このままアップすると 500 エラーになる** |

### 症状から探す

| 症状 | 確認すること |
|---|---|
| 別の案件の内容が出力された | `mockups\` を案件ごとのサブフォルダに分けているか（§1-3）。`buildDir` を案件ごとに分けているか |
| 画像がリンク切れになった | `pages` の並び順を変えていないか（§2 の警告）。順序を戻すか、ページ側の参照を直す |
| 手で直した CSS が消えた | 再変換で上書きされた（§6）。案件リポの Git 履歴から復元する |
| アップロードしたら全ページ 500 | `lib\` を上げ忘れていないか。`build\deploy\{案件名}\` の中身を丸ごと上げ直す |
| 本番の登録画像が消えた | FTP のミラーリング（同期削除）を使っていないか（§5-2） |

---

## 8. やってはいけないこと

- ❌ 設定ファイルを `configs\` の外に置く／案件名以外の名前を付ける → どの案件向けか判別できなくなる。必ず `configs\{案件名}.json`
- ❌ `convert.bat`・`deploy-prep.bat` をダブルクリックする → `--config` を渡せず失敗する
- ❌ `mockups\` 直下に複数案件のバンドルを混ぜる → 別案件の内容が出力される
- ❌ `pages` の並び順を後から変える → アセット名がズレる
- ❌ 案件リポの `public\` を手で直したまま再変換する → 消える（先に commit する）
- ❌ FTP のミラーリング（同期削除）を使う → 本番の登録画像が消える
- ❌ `build\` の中を手で編集して残そうとする → 変換のたびに作り直される
- ❌ `lib\` を上げずに `public\` だけアップする → 全ページ 500

---

## 9. チートシート

すべて `cms-front-pipeline` フォルダの PowerShell で実行する。`--config` は毎回必ず付ける。

```powershell
# 設定ファイルの一覧を見る（案件名の確認・打ち間違い防止）
ls configs

# 変換
npm run convert -- --config configs/{案件名}.json

# デプロイ準備（FTP アップ用フォルダ build\deploy\{案件名}\ を作る）
npm run deploy-prep -- --config configs/{案件名}.json

# 案件フォルダでローカル確認（ブラウザで http://localhost:8000）
cd ..\{案件名}
php -S localhost:8000 -t public
```

| やりたいこと | 実行するコマンド | ダブルクリック |
|---|---|---|
| 変換 | `npm run convert -- --config ...` | ❌ 使わない |
| デプロイ準備 | `npm run deploy-prep -- --config ...` | ❌ 使わない |

> `--yes` を付けると §3-3 の確認プロンプトを省略できるが、**対象案件を取り違えても止まらなくなる**。手作業では使わない（自動実行専用）。
