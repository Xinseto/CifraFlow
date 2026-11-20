@echo off
title CifraFlow - Aplicativo Desktop Local
cd /d "%~dp0"
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-desktop.ps1"
if errorlevel 1 (
    echo.
    echo [ERRO] O aplicativo encerrou com erro.
    pause
)
