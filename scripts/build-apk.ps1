$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " CifraFlow — Pipeline de Empacotamento Android (.apk)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (Get-Command "npx" -ErrorAction SilentlyContinue) {
    if (-not (Test-Path "android")) {
        Write-Host "[1/3] Inicializando plataforma Android via Capacitor..." -ForegroundColor Yellow
        npx @capacitor/cli add android
    }
    Write-Host "[2/3] Sincronizando base de código unificada (src/) com o projeto Android..." -ForegroundColor Yellow
    npx @capacitor/cli sync android

    Write-Host "[3/3] Compilando APK Debug/Release via Gradle..." -ForegroundColor Yellow
    Set-Location (Join-Path $repoRoot "android")
    .\gradlew.bat assembleDebug
    Write-Host "APK gerado em: android\app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor Green
} else {
    Write-Host "Configuração pronta em capacitor.config.json e src-tauri/tauri.conf.json." -ForegroundColor Yellow
    Write-Host "Para compilar o .apk no Windows ou Ubuntu, certifique-se de ter o Android SDK (ANDROID_HOME) e execute:" -ForegroundColor White
    Write-Host "  npx cap sync android && cd android && ./gradlew assembleDebug" -ForegroundColor Green
}
