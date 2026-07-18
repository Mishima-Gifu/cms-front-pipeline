# Claude Design バンドル → 静的+PHP 変換を 1 コマンドで実行する（PowerShell 版）。
# 引数はそのまま convert.mjs へ渡す（例: .\convert.ps1 --config other.json）。
# $PSScriptRoot = このスクリプトのあるディレクトリ(tools\) なので、cwd に依存しない。
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'convert.mjs'
& node $script @args
exit $LASTEXITCODE
