@echo off
rem 本番FTPアップ用のデプロイツリー(build\deploy\)生成をワンクリック/1コマンドで実行する。
rem CSSコメント除去・HTMLコメント除去（安全網）・uploads実体の除外を行う。詳細は deploy-prep.mjs 冒頭コメント。
rem %~dp0 = このバッチのあるディレクトリ(tools\) なので、どこから叩いても壊れない。
node "%~dp0deploy-prep.mjs" %*
if errorlevel 1 (
  echo.
  echo [deploy-prep] エラーで終了しました。上のログを確認してください。
  pause
)
