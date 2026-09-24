@echo off
title BlackDoc Desktop Dev
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-blackdoc-desktop-dev.ps1"
if errorlevel 1 pause
