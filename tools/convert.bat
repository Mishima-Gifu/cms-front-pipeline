@echo off
rem Run the Claude Design bundle -> static assets + PHP conversion in one step.
rem Args are passed through to convert.mjs (e.g. convert.bat --config other.json).
rem NOTE: keep this launcher ASCII-only. cmd.exe reads .bat under the OEM code page
rem       (CP932 on Japanese Windows), so Japanese bytes in a UTF-8 .bat get mis-parsed:
rem       a rem line can be cut short and its remainder executed as a command.
rem       Full Japanese docs live in the header of convert.mjs.
rem %~dp0 = folder of this bat (tools\), so it works from any working directory.
node "%~dp0convert.mjs" %*
if errorlevel 1 (
  echo.
  echo [convert] Failed. See the log above.
) else (
  echo.
  echo [convert] Finished. See the log above for warnings.
)
rem Pause on success too: warnings (leftover UUIDs, fonts.css differences) are printed
rem AFTER the conversion, so on double-click the console would close before they are read.
rem Scripted runs are unaffected because npm run convert calls convert.mjs directly.
pause
