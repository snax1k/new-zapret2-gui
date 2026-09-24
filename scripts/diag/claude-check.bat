@echo off
rem Discord reachability report. Each run is appended to claude-info.txt.
set LABEL=
set /p LABEL=Label for this run (e.g. multidisorder, proxy off): 
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0claude-check.ps1" -Label "%LABEL%"
pause
