#!/usr/bin/env python3
"""
Gerador Multiplataforma de Pacote Instalador Linux (.deb e .tar.gz) para o CifraFlow.
Gera:
  - dist/cifraflow_1.0.0_amd64.deb (Instalador nativo Ubuntu / Debian via dpkg / apt)
  - dist/CifraFlow-v1.0.0-linux-x64.tar.gz (Pacote portátil Linux)
Funciona 100% em Windows e Ubuntu Linux sem depender de ferramentas externas.
"""

import gzip
import io
import os
import tarfile
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = REPO_ROOT / "dist"
VERSION = "1.0.0"

DESKTOP_ENTRY = """[Desktop Entry]
Name=CifraFlow - Leitor de Cifras
Comment=Leitor de Cifras Musicais (.txt) e Afinador de Violao (100% Local)
Exec=/usr/bin/cifraflow
Icon=cifraflow
Terminal=false
Type=Application
Categories=AudioVideo;Audio;Music;
StartupNotify=true
"""

USR_BIN_WRAPPER = """#!/usr/bin/env bash
exec python3 /opt/cifraflow/cifraflow-linux.py "$@"
"""

CONTROL_CONTENT = f"""Package: cifraflow
Version: {VERSION}
Section: sound
Priority: optional
Architecture: amd64
Depends: python3
Recommends: zenity, python3-tk
Maintainer: Douglas Freitas <boydouglaspatrick@gmail.com>
Homepage: https://github.com/Xinseto/CifraFlow
Description: CifraFlow - Leitor de Cifras Musicais (.txt) e Afinador de Violao
 Aplicativo 100% local e offline para leitura, organizacao, edicao de cifras
 musicais em formato .txt, rolagem automatica e afinador de violao integrado.
"""

POSTINST_SCRIPT = """#!/bin/sh
set -e
chmod +x /opt/cifraflow/cifraflow-linux.py || true
chmod +x /usr/bin/cifraflow || true
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q || true
fi
exit 0
"""


def add_bytes_to_tar(tar, arcname, data_bytes, mode=0o644, mtime=None):
    info = tarfile.TarInfo(name=arcname)
    info.size = len(data_bytes)
    info.mode = mode
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    info.mtime = int(mtime or time.time())
    info.type = tarfile.REGTYPE
    tar.addfile(info, io.BytesIO(data_bytes))


def add_dir_to_tar(tar, arcname, mode=0o755, mtime=None):
    info = tarfile.TarInfo(name=arcname)
    info.mode = mode
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    info.mtime = int(mtime or time.time())
    info.type = tarfile.DIRTYPE
    tar.addfile(info)


def build_control_tar_gz(mtime):
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, mtime=mtime) as gz:
        with tarfile.open(mode="w", fileobj=gz, format=tarfile.GNU_FORMAT) as tar:
            add_dir_to_tar(tar, "./", 0o755, mtime)
            add_bytes_to_tar(tar, "./control", CONTROL_CONTENT.encode("utf-8"), 0o644, mtime)
            add_bytes_to_tar(tar, "./postinst", POSTINST_SCRIPT.encode("utf-8"), 0o755, mtime)
    return buf.getvalue()


def build_data_tar_gz(mtime):
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, mtime=mtime) as gz:
        with tarfile.open(mode="w", fileobj=gz, format=tarfile.GNU_FORMAT) as tar:
            for d in [
                "./",
                "./opt/",
                "./opt/cifraflow/",
                "./opt/cifraflow/src/",
                "./opt/cifraflow/sample-cifras/",
                "./usr/",
                "./usr/bin/",
                "./usr/share/",
                "./usr/share/applications/",
                "./usr/share/icons/",
                "./usr/share/icons/hicolor/",
                "./usr/share/icons/hicolor/256x256/",
                "./usr/share/icons/hicolor/256x256/apps/",
            ]:
                add_dir_to_tar(tar, d, 0o755, mtime)

            # Copia src/
            src_root = REPO_ROOT / "src"
            for item in sorted(src_root.rglob("*")):
                rel = item.relative_to(src_root).as_posix()
                arc = f"./opt/cifraflow/src/{rel}"
                if item.is_dir():
                    add_dir_to_tar(tar, arc + "/", 0o755, mtime)
                else:
                    raw = item.read_bytes()
                    if item.suffix in {".html", ".js", ".css", ".json", ".md"}:
                        raw = raw.replace(b"\r\n", b"\n")
                    add_bytes_to_tar(tar, arc, raw, 0o644, mtime)

            # Copia sample-cifras/
            sample_root = REPO_ROOT / "sample-cifras"
            if sample_root.is_dir():
                for item in sorted(sample_root.rglob("*.txt")):
                    rel = item.relative_to(sample_root).as_posix()
                    raw = item.read_bytes().replace(b"\r\n", b"\n")
                    add_bytes_to_tar(tar, f"./opt/cifraflow/sample-cifras/{rel}", raw, 0o644, mtime)

            # Host Python Linux
            linux_host = (REPO_ROOT / "native-host" / "cifraflow-linux.py").read_bytes().replace(b"\r\n", b"\n")
            add_bytes_to_tar(tar, "./opt/cifraflow/cifraflow-linux.py", linux_host, 0o755, mtime)

            # Binário /usr/bin/cifraflow
            add_bytes_to_tar(tar, "./usr/bin/cifraflow", USR_BIN_WRAPPER.encode("utf-8"), 0o755, mtime)

            # Atalho .desktop e ícone
            add_bytes_to_tar(
                tar,
                "./usr/share/applications/cifraflow.desktop",
                DESKTOP_ENTRY.encode("utf-8"),
                0o644,
                mtime,
            )
            icon_png = (REPO_ROOT / "src" / "assets" / "icon.png").read_bytes()
            add_bytes_to_tar(
                tar,
                "./usr/share/icons/hicolor/256x256/apps/cifraflow.png",
                icon_png,
                0o644,
                mtime,
            )
    return buf.getvalue()


def make_ar_member(name, content_bytes, mtime):
    header = (
        f"{name:<16}"
        f"{int(mtime):<12}"
        f"{0:<6}"
        f"{0:<6}"
        f"{'100644':<8}"
        f"{len(content_bytes):<10}"
        "`\n"
    ).encode("ascii")
    pad = b"\n" if (len(content_bytes) % 2 == 1) else b""
    return header + content_bytes + pad


def build_deb():
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    mtime = int(time.time())

    debian_binary = b"2.0\n"
    control_gz = build_control_tar_gz(mtime)
    data_gz = build_data_tar_gz(mtime)

    deb_bytes = (
        b"!<arch>\n"
        + make_ar_member("debian-binary", debian_binary, mtime)
        + make_ar_member("control.tar.gz", control_gz, mtime)
        + make_ar_member("data.tar.gz", data_gz, mtime)
    )

    deb_path = DIST_DIR / f"cifraflow_{VERSION}_amd64.deb"
    deb_path.write_bytes(deb_bytes)
    print(f"[Linux .deb] Gerado com sucesso: {deb_path} ({len(deb_bytes)} bytes)")

    # Também gera o pacote .tar.gz portátil para qualquer distribuição Linux
    tar_gz_path = DIST_DIR / f"CifraFlow-v{VERSION}-linux-x64.tar.gz"
    with tarfile.open(tar_gz_path, "w:gz") as tar:
        tar.add(REPO_ROOT / "src", arcname="CifraFlow/src")
        tar.add(REPO_ROOT / "sample-cifras", arcname="CifraFlow/sample-cifras")
        tar.add(REPO_ROOT / "native-host" / "cifraflow-linux.py", arcname="CifraFlow/cifraflow-linux.py")
        tar.add(REPO_ROOT / "scripts" / "run-desktop.sh", arcname="CifraFlow/run-desktop.sh")
        tar.add(REPO_ROOT / "README.md", arcname="CifraFlow/README.md")
    print(f"[Linux .tar.gz] Gerado com sucesso: {tar_gz_path} ({tar_gz_path.stat().st_size} bytes)")


if __name__ == "__main__":
    build_deb()
