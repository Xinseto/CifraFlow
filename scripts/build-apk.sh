#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "=========================================================="
echo " CifraFlow — Pipeline de Empacotamento Android (.apk)"
echo "=========================================================="

if command -v npx >/dev/null 2>&1; then
  if [ ! -d "android" ]; then
    echo "[1/3] Inicializando plataforma Android via Capacitor..."
    npx @capacitor/cli add android
  fi
  echo "[2/3] Sincronizando base de código unificada (src/)..."
  npx @capacitor/cli sync android
  echo "[3/3] Compilando APK via Gradle..."
  cd android && ./gradlew assembleDebug
  echo "APK gerado em: android/app/build/outputs/apk/debug/app-debug.apk"
else
  echo "Manifestos prontos em capacitor.config.json e src-tauri/tauri.conf.json."
fi
