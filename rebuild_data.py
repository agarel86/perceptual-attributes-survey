"""
Rebuild survey_app data for the 100-house random sample.
- Generates  data/houses.json   (100 houses, images only, no AI features)
- Generates  data/lots.json     (10 lots of 10 houses each)
- Replaces   images/            (JPGs from random_house_sample_koen)
"""
import json, os, shutil, random

BASE = os.path.dirname(os.path.abspath(__file__))
SAMPLE_DIR = os.path.join(os.path.dirname(os.path.dirname(BASE)), "random_house_sample_koen")
DATA_DIR = os.path.join(BASE, "data")
IMAGES_DIR = os.path.join(BASE, "images")

random.seed(42)


def collect_houses():
    houses = []
    for d in sorted(os.listdir(SAMPLE_DIR)):
        if not d.startswith("id"):
            continue
        src = os.path.join(SAMPLE_DIR, d)
        if not os.path.isdir(src):
            continue
        imgs = sorted([
            f for f in os.listdir(src)
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
            and not f.startswith("temp_")
        ])
        if not imgs:
            continue
        houses.append({
            "id": d,
            "ip": f"/images/{d}/",
            "imgs": imgs,
            "feats": [],
        })
    return houses


def assign_lots(houses, n_lots=10):
    ids = [h["id"] for h in houses]
    random.shuffle(ids)
    lots = {}
    per_lot = len(ids) // n_lots
    remainder = len(ids) % n_lots
    idx = 0
    for lot in range(1, n_lots + 1):
        size = per_lot + (1 if lot <= remainder else 0)
        lots[str(lot)] = ids[idx:idx + size]
        idx += size
    return lots


def copy_images(houses):
    if os.path.exists(IMAGES_DIR) or os.path.islink(IMAGES_DIR):
        print("Removing old images...")
        if os.path.islink(IMAGES_DIR) or os.path.islink(IMAGES_DIR.rstrip(os.sep)):
            os.remove(IMAGES_DIR)
        else:
            shutil.rmtree(IMAGES_DIR)
    os.makedirs(IMAGES_DIR, exist_ok=True)
    total = 0
    for h in houses:
        src_dir = os.path.join(SAMPLE_DIR, h["id"])
        dst_dir = os.path.join(IMAGES_DIR, h["id"])
        os.makedirs(dst_dir, exist_ok=True)
        for img in h["imgs"]:
            shutil.copy2(os.path.join(src_dir, img), os.path.join(dst_dir, img))
            total += 1
    return total


def main():
    print("Collecting houses from random_house_sample_koen...")
    houses = collect_houses()
    print(f"  Found {len(houses)} houses")

    print("Assigning lots (10 houses each)...")
    lots = assign_lots(houses)
    for lot_id, ids in sorted(lots.items(), key=lambda x: int(x[0])):
        print(f"  Lot {lot_id}: {len(ids)} houses — {ids[:3]}...")

    print("Writing data/houses.json...")
    with open(os.path.join(DATA_DIR, "houses.json"), "w", encoding="utf-8") as f:
        json.dump(houses, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  {os.path.getsize(os.path.join(DATA_DIR, 'houses.json')) / 1024:.0f} KB")

    print("Writing data/lots.json...")
    with open(os.path.join(DATA_DIR, "lots.json"), "w", encoding="utf-8") as f:
        json.dump(lots, f, ensure_ascii=False, indent=2)

    print("Copying images...")
    total = copy_images(houses)
    print(f"  {total} images copied across {len(houses)} houses")

    print("\nDone! Survey app data updated.")
    print(f"  houses.json: {len(houses)} houses")
    print(f"  lots.json:   {len(lots)} lots, 10 houses each")
    print(f"  images/:     {total} photos")


if __name__ == "__main__":
    main()
