@echo off
rem Build the FTP deploy tree (build\deploy\<project>\) in one step.
rem Strips CSS comments, removes stray HTML comments (safety net), excludes uploads bodies.
rem NOTE: keep this launcher ASCII-only. cmd.exe reads .bat under the OEM code page
rem       (CP932 on Japanese Windows), so Japanese bytes in a UTF-8 .bat get mis-parsed
rem       and break execution. Full Japanese docs live in the header of deploy-prep.mjs.
rem %~dp0 = folder of this bat (tools\), so it works from any working directory.
node "%~dp0deploy-prep.mjs" %*
if errorlevel 1 (
  echo.
  echo [deploy-prep] Failed. See the log above.
  pause
)
