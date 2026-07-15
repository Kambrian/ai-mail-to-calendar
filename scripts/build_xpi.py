#!/usr/bin/env python3
"""Build a reviewable Thunderbird XPI from an explicit source allowlist."""
from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "dist"
INCLUDE = (
    "manifest.json",
    "background/background.js",
    "confirm/confirm.html",
    "confirm/confirm.js",
    "icons/icon48.png",
    "icons/icon96.png",
    "options/options.html",
    "options/options.js",
    "progress/progress.html",
    "progress/progress.js",
)


def main() -> None:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    output = OUTPUT_DIR / f"ai-mail-to-calendar-{version}.xpi"
    staging = ROOT / ".build-xpi"

    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir()
    try:
        for relative_name in INCLUDE:
            source = ROOT / relative_name
            if not source.is_file():
                raise FileNotFoundError(f"Required package file is missing: {relative_name}")
            destination = staging / relative_name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)

        OUTPUT_DIR.mkdir(exist_ok=True)
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(staging.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(staging).as_posix())
        print(output)
    finally:
        shutil.rmtree(staging, ignore_errors=True)


if __name__ == "__main__":
    main()
