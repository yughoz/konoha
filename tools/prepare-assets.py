#!/usr/bin/env python3
"""Normalize completed Bumi downloads; run with the Pillow-enabled Python."""
import json
from pathlib import Path
import subprocess
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "output/imagegen"
DEST = ROOT / "public/assets"
CHROMA = Path.home() / ".codex/skills/.system/imagegen/scripts/remove_chroma_key.py"
SIZES = {"house": (768, 768, 16), "tree": (512, 512, 12), "bush": (512, 320, 12)}
SIZES.update({f"villager-{n}": (192, 256, 12) for n in range(1, 5)})
NAMES = ["background", *SIZES]


def source(name):
    records = sorted((RAW / name).glob("generation-*.json"), key=lambda p: p.stat().st_mtime)
    if not records:
        raise ValueError(f"No generation metadata for {name}")
    info = json.loads(records[-1].read_text())
    if info.get("status") != "completed" or not info.get("downloaded_file"):
        raise ValueError(f"Generation is not downloaded/completed: {name}")
    filename = info["downloaded_file"]
    if Path(filename).name != filename:
        raise ValueError(f"Invalid downloaded filename: {name}")
    path = RAW / name / filename
    with Image.open(path) as image:
        image.verify()
    return path


def prepare(name):
    raw = source(name)
    if name == "background":
        with Image.open(raw) as image:
            result = image.convert("RGB").resize((1600, 1120), Image.Resampling.LANCZOS)
    else:
        cutout = RAW / name / "cutout.png"
        subprocess.run([sys.executable, str(CHROMA), "--input", str(raw), "--out", str(cutout),
                        "--key-color", "#ff00ff", "--soft-matte", "--transparent-threshold", "35",
                        "--opaque-threshold", "130", "--spill-cleanup", "--force"], check=True)
        with Image.open(cutout) as image:
            image = image.convert("RGBA")
            bbox = image.getchannel("A").point(lambda a: 255 if a > 25 else 0).getbbox()
            if bbox is None:
                raise ValueError(f"Chroma removal erased the subject: {name}")
            image = image.crop(bbox)
        width, height, pad = SIZES[name]
        scale = min((width - 2 * pad) / image.width, (height - 2 * pad) / image.height)
        if name.startswith("villager-"):
            scale = 232 / image.height
            if round(image.width * scale) > width - 2 * pad:
                raise ValueError(f"Villager silhouette too wide for a uniform 232px height: {name}")
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
        result = Image.new("RGBA", (width, height))
        result.alpha_composite(image, ((width - image.width) // 2, height - pad - image.height))
        alpha = result.getchannel("A")
        assert all(alpha.getpixel(p) == 0 for p in [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)])
        assert alpha.getextrema() == (0, 255), f"Missing transparent/opaque pixels: {name}"
        x0, y0, x1, y1 = alpha.getbbox()
        assert min(x0, y0, width - x1, height - y1) >= 2, f"Clipped subject: {name}"
    DEST.mkdir(parents=True, exist_ok=True)
    temp = DEST / f".{name}.png.tmp"
    result.save(temp, format="PNG", optimize=True)
    temp.replace(DEST / f"{name}.png")
    print(f"Prepared {name}.png: {result.width}x{result.height}")


if __name__ == "__main__":
    requested = sys.argv[1:] or NAMES
    if any(name not in NAMES for name in requested):
        raise SystemExit("Usage: prepare-assets.py [background house tree bush villager-1 ... villager-4]")
    for name in requested:
        prepare(name)
