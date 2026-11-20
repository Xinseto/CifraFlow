@echo off
title CifraFlow - Leitor de Cifras
cd /d "%~dp0"
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-desktop.ps1"
if errorlevel 1 (
    echo.
    echo [ERRO] O aplicativo encerrou com erro.
    pause
)
