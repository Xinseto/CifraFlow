#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if command -v cargo-tauri >/dev/null 2>&1; then
  echo "[CifraFlow] Iniciando via Tauri v2 Desktop (Ubuntu Linux)..."
  cargo tauri dev
elif python3 -c "import webview" >/dev/null 2>&1; then
  echo "[CifraFlow] Iniciando via PyWebView Nativo (Ubuntu Linux)..."
  python3 -c "import webview, os; webview.create_window('CifraFlow', os.path.abspath('src/index.html'), width=1320, height=840); webview.start()"
else
  echo "[CifraFlow] Iniciando janela dedicada nativa local..."
  xdg-open "$REPO_ROOT/src/index.html"
fi
