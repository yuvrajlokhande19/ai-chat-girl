@echo off
title Chloe AI Launcher
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoExit -File "%~dp0launcher.ps1"
