@echo off
rem Claude Design バンドル → 静的+PHP 変換をワンクリック/1コマンドで実行する。
rem 引数はそのまま convert.mjs へ渡す（例: convert.bat --config other.json）。
rem %~dp0 = このバッチのあるディレクトリ(tools\) なので、どこから叩いても壊れない。
node "%~dp0convert.mjs" %*
if errorlevel 1 (
  echo.
  echo [convert] エラーで終了しました。上のログを確認してください。
  pause
)
