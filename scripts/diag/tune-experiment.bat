@echo off
rem Experiment: why autotune reports false negatives. Close the app first.
rem Needs admin rights (WinDivert driver) - the script asks UAC itself.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tune-experiment.ps1"
