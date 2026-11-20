#!/usr/bin/env python3
"""
CifraFlow - Host Desktop Nativo para Ubuntu / Debian Linux
Suporta PyWebView (GTK/WebKit2) com diálogo nativo de pastas (Zenity / Tkinter)
e fallback para janela dedicada em modo App (--app) 100% local.
"""

import json
import os
import subprocess
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent
SRC_DIR = APP_ROOT / "src"
CONFIG_DIR = Path.home() / ".config" / "cifraflow"
SETTINGS_FILE = CONFIG_DIR / "settings.json"


class CifraFlowLinuxApi:
    def invoke(self, action, payload=None):
        payload = payload or {}
        if action == "init":
            return self.handle_init()
        if action == "openFolderDialog":
            return self.handle_open_folder(payload.get("initialFolder", ""))
        if action == "scanDirectory":
            return self.scan_directory(payload.get("folderPath", ""))
        if action == "readTextFile":
            return {"content": self.read_text_smart(payload.get("fullPath", ""))}
        if action == "writeTextFile":
            full_path = payload.get("fullPath", "")
            content = payload.get("content", "")
            Path(full_path).write_text(content, encoding="utf-8")
            return {"success": True, "fullPath": full_path}
        if action == "createTextFile":
            return self.handle_create_file(payload)
        if action == "saveSettings":
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            SETTINGS_FILE.write_text(
                json.dumps(payload.get("settings", {}), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            return {"saved": True}
        raise ValueError(f"Ação desconhecida: {action}")

    def handle_init(self):
        settings = self.load_settings()
        folder = settings.get("lastFolder", "")
        if not folder or not Path(folder).is_dir():
            folder = str(APP_ROOT / "sample-cifras")
        scan = self.scan_directory(folder)
        return {
            "settings": settings,
            "currentFolder": folder,
            "files": scan["files"],
        }

    def handle_open_folder(self, initial_folder=""):
        selected = ""
        try:
            proc = subprocess.run(
                [
                    "zenity",
                    "--file-selection",
                    "--directory",
                    "--title=Selecione a pasta com suas cifras (.txt)",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            if proc.returncode == 0:
                selected = proc.stdout.strip()
        except FileNotFoundError:
            try:
                import tkinter as tk
                from tkinter import filedialog

                root = tk.Tk()
                root.withdraw()
                selected = filedialog.askdirectory(
                    initialdir=initial_folder or str(Path.home()),
                    title="Selecione a pasta com suas cifras (.txt)",
                )
                root.destroy()
            except Exception:
                pass

        if not selected or not Path(selected).is_dir():
            return {"cancelled": True}
        return self.scan_directory(selected)

    def scan_directory(self, folder_path):
        files_list = []
        root_path = Path(folder_path)
        if folder_path and root_path.is_dir():
            for txt_file in sorted(root_path.rglob("*.txt"), key=lambda p: p.name.lower()):
                try:
                    rel = str(txt_file.relative_to(root_path))
                except ValueError:
                    rel = txt_file.name
                files_list.append(
                    {
                        "name": txt_file.name,
                        "relativePath": rel,
                        "fullPath": str(txt_file),
                    }
                )
        return {
            "cancelled": False,
            "folderPath": str(folder_path),
            "files": files_list,
        }

    def handle_create_file(self, payload):
        folder = payload.get("folderPath") or str(APP_ROOT / "sample-cifras")
        file_name = payload.get("fileName", "Nova Cifra.txt")
        if not file_name.lower().endswith(".txt"):
            file_name += ".txt"
        content = payload.get("content", "")
        target = Path(folder) / file_name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        scan = self.scan_directory(folder)
        return {
            "success": True,
            "createdFile": {
                "name": target.name,
                "relativePath": target.name,
                "fullPath": str(target),
            },
            "files": scan["files"],
        }

    @staticmethod
    def read_text_smart(path_str):
        raw = Path(path_str).read_bytes()
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            return raw.decode("cp1252", errors="replace")

    @staticmethod
    def load_settings():
        try:
            if SETTINGS_FILE.is_file():
                return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
        return {}


def start_local_app_mode():
    os.chdir(str(SRC_DIR))
    server = ThreadingHTTPServer(("127.0.0.1", 0), SimpleHTTPRequestHandler)
    port = server.server_port
    url = f"http://127.0.0.1:{port}/index.html"

    threading.Thread(target=server.serve_forever, daemon=True).start()

    for browser_cmd in ["google-chrome", "chromium", "chromium-browser", "brave-browser", "microsoft-edge"]:
        try:
            proc = subprocess.Popen([browser_cmd, f"--app={url}", "--window-size=1320,840"])
            proc.wait()
            return
        except FileNotFoundError:
            continue

    webbrowser.open(url)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass


def main():
    try:
        import webview

        api = CifraFlowLinuxApi()
        webview.create_window(
            "CifraFlow - Leitor de Cifras",
            str(SRC_DIR / "index.html"),
            js_api=api,
            width=1320,
            height=840,
            min_size=(360, 620),
            background_color="#0C0E13",
        )
        webview.start()
    except ImportError:
        start_local_app_mode()


if __name__ == "__main__":
    main()
