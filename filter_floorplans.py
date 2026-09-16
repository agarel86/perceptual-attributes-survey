"""
Filter out floor-plan images from houses.json.

Strategy: use a lightweight vision heuristic — floor plans are typically
line drawings with very low colour variance and high white-pixel ratio.
We check each image and remove likely floor plans / text-only images.
"""
import json, os
from PIL import Image
import numpy as np

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
IMAGES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")

def is_floorplan(img_path, saturation_thresh=25, white_ratio_thresh=0.70):
    """Return True if the image looks like a floor plan or technical drawing."""
    try:
        img = Image.open(img_path).convert("RGB")
        # Resize for speed
        img = img.resize((200, 200), Image.LANCZOS)
        arr = np.array(img, dtype=np.float32)

        # Convert to HSV-like: compute saturation
        r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
        cmax = np.maximum(np.maximum(r, g), b)
        cmin = np.minimum(np.minimum(r, g), b)
        delta = cmax - cmin
        # Saturation (0-255 scale)
        sat = np.where(cmax > 0, (delta / cmax) * 255, 0)
        mean_sat = sat.mean()

        # White pixel ratio (all channels > 230)
        white = np.all(arr > 230, axis=2)
        white_ratio = white.mean()

        # Floor plans: very low saturation + lots of white
        if mean_sat < saturation_thresh and white_ratio > white_ratio_thresh:
            return True

        # Also catch mostly-white images with thin lines (even lower bar)
        if mean_sat < 15 and white_ratio > 0.55:
            return True

        return False
    except Exception as e:
        print(f"  Warning: could not process {img_path}: {e}")
        return False


def main():
    with open(os.path.join(DATA_DIR, "houses.json"), "r", encoding="utf-8") as f:
        houses = json.load(f)

    total_removed = 0
    for h in houses:
        hid = h["id"]
        img_dir = os.path.join(IMAGES_DIR, hid)
        if not os.path.isdir(img_dir):
            continue

        keep = []
        removed = []
        for img_name in h["imgs"]:
            img_path = os.path.join(img_dir, img_name)
            if os.path.exists(img_path) and is_floorplan(img_path):
                removed.append(img_name)
            else:
                keep.append(img_name)

        if removed:
            print(f"{hid}: removed {len(removed)} floor plan(s): {', '.join(removed)}")
            total_removed += len(removed)
            h["imgs"] = keep

    # Write updated houses.json
    with open(os.path.join(DATA_DIR, "houses.json"), "w", encoding="utf-8") as f:
        json.dump(houses, f, ensure_ascii=False)

    total_imgs = sum(len(h["imgs"]) for h in houses)
    print(f"\nDone. Removed {total_removed} floor plans. {total_imgs} images remaining across {len(houses)} houses.")


if __name__ == "__main__":
    main()
