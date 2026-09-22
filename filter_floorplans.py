"""
Remove floor plans and technical drawings from houses.json.

Catches:
  - B/W line drawings (high white ratio, low saturation)
  - Colored schematic plans (few flat fills, dimension canvas)
  - 3D computer-generated floor-plan renders (Bidit-style)
"""
import json
import os
from collections import Counter

import numpy as np
from PIL import Image

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
IMAGES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")


def _features(img_path):
    img = Image.open(img_path).convert("RGB").resize((256, 256), Image.LANCZOS)
    arr = np.array(img, dtype=np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    cmax = np.maximum(np.maximum(r, g), b)
    cmin = np.minimum(np.minimum(r, g), b)
    with np.errstate(invalid="ignore", divide="ignore"):
        sat = np.where(cmax > 0, ((cmax - cmin) / cmax) * 255, 0)
    mean_sat = float(np.nanmean(sat))
    white = float(np.all(arr > 220, axis=2).mean())
    gray = arr.mean(axis=2)
    luma = float(gray.mean())
    q = (arr.astype(np.uint8) >> 4).reshape(-1, 3)
    unique = len({(int(x[0]), int(x[1]), int(x[2])) for x in q})
    blk_stds = [
        gray[i : i + 16, j : j + 16].std()
        for i in range(0, 256, 16)
        for j in range(0, 256, 16)
    ]
    flat = float((np.array(blk_stds) < 8).mean())
    return mean_sat, white, unique, luma, flat


def is_floorplan(img_path):
    try:
        mean_sat, white, unique, luma, flat = _features(img_path)
    except Exception as e:
        print(f"  Warning: could not process {img_path}: {e}")
        return False

    # Classic B/W line drawings
    if mean_sat < 25 and white > 0.55:
        return True
    if mean_sat < 15 and white > 0.45:
        return True
    # Colored schematic plans + 3D computer-generated renders
    if unique <= 185 and flat >= 0.38 and (white >= 0.15 or luma >= 160):
        return True
    if unique <= 200 and white >= 0.50 and luma >= 200:
        return True
    return False


def main():
    with open(os.path.join(DATA_DIR, "houses.json"), encoding="utf-8") as f:
        houses = json.load(f)

    total_removed = 0
    empty = []
    for h in houses:
        hid = h["id"]
        img_dir = os.path.join(IMAGES_DIR, hid)
        if not os.path.isdir(img_dir):
            continue
        keep, removed = [], []
        for img_name in h["imgs"]:
            path = os.path.join(img_dir, img_name)
            if os.path.exists(path) and is_floorplan(path):
                removed.append(img_name)
            else:
                keep.append(img_name)
        if removed:
            print(f"{hid}: removed {len(removed)}  kept {len(keep)}")
            total_removed += len(removed)
            h["imgs"] = keep
        if not keep:
            empty.append(hid)

    with open(os.path.join(DATA_DIR, "houses.json"), "w", encoding="utf-8") as f:
        json.dump(houses, f, ensure_ascii=False)

    n_imgs = sum(len(h["imgs"]) for h in houses)
    print(f"\nRemoved {total_removed} floor plans / schematics.")
    print(f"{n_imgs} photos remain across {len(houses)} houses.")
    if empty:
        print("WARNING houses with no photos left:", empty)


if __name__ == "__main__":
    main()
