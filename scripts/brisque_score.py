#!/usr/bin/env python3
"""Compute BRISQUE score for an image supplied as base64 via stdin.

Exits non‑zero on failure and writes a JSON object like {"score": 18.7} to stdout.
Requires opencv-contrib-python (for cv2.quality) and downloads the BRISQUE model
files next to this script on first use if they are missing.
"""

import base64
import json
import sys
import urllib.request
from pathlib import Path

try:
    import cv2  # type: ignore
    import numpy as np  # type: ignore
except Exception as exc:  # pragma: no cover - dependency load
    sys.stderr.write(f"Failed to import dependencies: {exc}\n")
    sys.exit(1)


MODEL_URL = "https://raw.githubusercontent.com/opencv/opencv_contrib/4.x/modules/quality/samples/brisque_model_live.yml"
RANGE_URL = "https://raw.githubusercontent.com/opencv/opencv_contrib/4.x/modules/quality/samples/brisque_range_live.yml"


def ensure_model_files(base_dir: Path):
    targets = [
        (MODEL_URL, base_dir / "brisque_model_live.yml"),
        (RANGE_URL, base_dir / "brisque_range_live.yml"),
    ]
    for url, dest in targets:
        if dest.exists():
            continue
        try:
            dest.parent.mkdir(parents=True, exist_ok=True)
            urllib.request.urlretrieve(url, dest)
        except Exception as exc:  # pragma: no cover - network dependent
            return False, f"could not fetch {url}: {exc}"
    return True, None


def main():
    base64_input = sys.stdin.read().strip()
    if not base64_input:
        sys.stderr.write("No base64 data on stdin\n")
        return 1

    script_dir = Path(__file__).resolve().parent
    cache_dir = script_dir / ".cache"
    ok, err = ensure_model_files(cache_dir)
    if not ok:
        sys.stderr.write(err + "\n")
        return 1

    try:
        binary = base64.b64decode(base64_input, validate=True)
    except Exception as exc:
        sys.stderr.write(f"Failed to decode base64: {exc}\n")
        return 1

    arr = np.frombuffer(binary, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        sys.stderr.write("Could not decode image buffer\n")
        return 1

    model_path = str(cache_dir / "brisque_model_live.yml")
    range_path = str(cache_dir / "brisque_range_live.yml")

    try:
        raw = cv2.quality.QualityBRISQUE_compute(img, model_path, range_path)
        # OpenCV may return a scalar float or a 1x1 array depending on version
        if hasattr(raw, "shape") and raw.shape != ():
            score = float(raw.flat[0])
        elif isinstance(raw, (list, tuple)):
            score = float(raw[0])
        else:
            score = float(raw)
    except Exception as exc:
        sys.stderr.write(f"BRISQUE failed: {exc}\n")
        return 1

    sys.stdout.write(json.dumps({"score": score}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
