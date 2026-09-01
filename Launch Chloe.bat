@echo off
title Chloe AI Launcher
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0launcher.ps1"
pause