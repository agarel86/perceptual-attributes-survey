"""
Rebuild the survey from propfiles_sample200.zip.

- Extract listing photos only (no PDF/TXT)
- Drop floor plans / technical drawings
- 200 houses, 10 users x 20 houses
- 6 attributes per house from 6 different families, balanced across 38 attrs
"""
import json
import os
import random
import shutil
import zipfile
from collections import Counter, defaultdict

from filter_floorplans import is_floorplan

BASE = os.path.dirname(os.path.abspath(__file__))
ZIP_PATH = os.path.join(os.path.dirname(os.path.dirname(BASE)), "propfiles_sample200.zip")
DATA_DIR = os.path.join(BASE, "data")
IMAGES_DIR = os.path.join(BASE, "images")
SEED = 42
N_USERS = 10
HOUSES_PER_USER = 20
ATTRS_PER_HOUSE = 6


def extract_photos():
    if not os.path.isfile(ZIP_PATH):
        raise FileNotFoundError(ZIP_PATH)

    if os.path.exists(IMAGES_DIR):
        print("Removing old images/...")
        shutil.rmtree(IMAGES_DIR)
    os.makedirs(IMAGES_DIR, exist_ok=True)

    print(f"Extracting JPEGs from {ZIP_PATH}...")
    n = 0
    with zipfile.ZipFile(ZIP_PATH) as z:
        for info in z.infolist():
            name = info.filename.replace("\\", "/")
            if info.is_dir():
                continue
            low = name.lower()
            if not low.endswith((".jpg", ".jpeg", ".png", ".webp")):
                continue
            parts = [p for p in name.split("/") if p]
            # propfiles_sample200 / idXXXX / file.jpg
            hid = next((p for p in parts if p.startswith("id") and p[2:].isdigit()), None)
            fname = parts[-1]
            if not hid or fname.startswith("temp_"):
                continue
            dst_dir = os.path.join(IMAGES_DIR, hid)
            os.makedirs(dst_dir, exist_ok=True)
            dst = os.path.join(dst_dir, fname)
            with z.open(info) as src, open(dst, "wb") as out:
                shutil.copyfileobj(src, out)
            n += 1
            if n % 500 == 0:
                print(f"  {n} photos...")
    print(f"  Extracted {n} photos")
    return n


def filter_floorplans():
    print("Filtering floor plans...")
    houses = []
    total_removed = 0
    for hid in sorted(os.listdir(IMAGES_DIR)):
        src = os.path.join(IMAGES_DIR, hid)
        if not os.path.isdir(src) or not hid.startswith("id"):
            continue
        imgs = sorted(
            f for f in os.listdir(src)
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
        )
        keep = []
        for img_name in imgs:
            path = os.path.join(src, img_name)
            if is_floorplan(path):
                os.remove(path)
                total_removed += 1
            else:
                keep.append(img_name)
        if not keep:
            print(f"  WARNING {hid}: no photos left after floor-plan filter")
            continue
        houses.append({
            "id": hid,
            "ip": f"/images/{hid}/",
            "imgs": keep,
            "feats": [],
        })
    print(f"  Removed {total_removed} floor plans; {len(houses)} houses remain")
    return houses


def assign_lots(houses, n_lots=N_USERS, per_lot=HOUSES_PER_USER):
    rng = random.Random(SEED)
    ids = [h["id"] for h in houses]
    rng.shuffle(ids)
    if len(ids) != n_lots * per_lot:
        print(f"  NOTE: {len(ids)} houses vs {n_lots}x{per_lot}={n_lots * per_lot} expected")
    lots = {}
    idx = 0
    for lot in range(1, n_lots + 1):
        lots[str(lot)] = ids[idx:idx + per_lot]
        idx += per_lot
    leftover = ids[idx:]
    if leftover:
        print(f"  Unassigned leftover houses: {leftover}")
    return lots


def allocate_attributes(houses, taxonomy, n_attrs=ATTRS_PER_HOUSE):
    rng = random.Random(SEED)
    by_fam = defaultdict(list)
    for a in taxonomy:
        by_fam[a["sec"]].append(a)
    fam_keys = list(by_fam.keys())
    if len(fam_keys) < n_attrs:
        raise ValueError(f"Need {n_attrs} families, have {len(fam_keys)}")

    attr_count = {a["vn"]: 0 for a in taxonomy}
    assignment = {}
    ids = [h["id"] for h in houses]
    rng.shuffle(ids)

    for hid in ids:
        ranked = sorted(
            fam_keys,
            key=lambda f: (
                min(attr_count[a["vn"]] for a in by_fam[f]),
                sum(attr_count[a["vn"]] for a in by_fam[f]) / len(by_fam[f]),
                rng.random(),
            ),
        )
        chosen_fams = ranked[:n_attrs]
        chosen = []
        for f in chosen_fams:
            a = min(by_fam[f], key=lambda x: (attr_count[x["vn"]], rng.random()))
            chosen.append(a["vn"])
            attr_count[a["vn"]] += 1
        assignment[hid] = chosen

    counts = Counter(attr_count.values())
    print("  Attribute appearance counts:", dict(sorted(counts.items())))
    print(f"  min={min(attr_count.values())} max={max(attr_count.values())} "
          f"mean={sum(attr_count.values())/len(attr_count):.2f}")
    fam_used = Counter()
    for hid, vns in assignment.items():
        secs = [next(a["sec"] for a in taxonomy if a["vn"] == vn) for vn in vns]
        assert len(set(secs)) == n_attrs, hid
        fam_used.update(secs)
    print("  Family selection counts:")
    for f, n in sorted(fam_used.items(), key=lambda x: -x[1]):
        print(f"    {f}: {n}")
    return assignment


def main():
    with open(os.path.join(DATA_DIR, "taxonomy.json"), encoding="utf-8") as f:
        taxonomy = json.load(f)

    extract_photos()
    houses = filter_floorplans()
    if len(houses) != 200:
        print(f"WARNING: expected 200 houses, got {len(houses)}")

    print("Assigning 20 houses per user...")
    lots = assign_lots(houses)
    for lot_id, ids in sorted(lots.items(), key=lambda x: int(x[0])):
        print(f"  user{lot_id} / lot {lot_id}: {len(ids)} houses")

    print("Allocating 6 attributes per house (different families, balanced)...")
    house_attrs = allocate_attributes(houses, taxonomy)

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, "houses.json"), "w", encoding="utf-8") as f:
        json.dump(houses, f, ensure_ascii=False)
    with open(os.path.join(DATA_DIR, "lots.json"), "w", encoding="utf-8") as f:
        json.dump(lots, f, ensure_ascii=False, indent=2)
    with open(os.path.join(DATA_DIR, "house_attrs.json"), "w", encoding="utf-8") as f:
        json.dump(house_attrs, f, ensure_ascii=False, indent=2)

    n_imgs = sum(len(h["imgs"]) for h in houses)
    print("\nDone.")
    print(f"  houses: {len(houses)}")
    print(f"  photos: {n_imgs}")
    print(f"  lots:   {len(lots)} x {HOUSES_PER_USER}")
    print(f"  attrs:  {ATTRS_PER_HOUSE} per house")


if __name__ == "__main__":
    main()
