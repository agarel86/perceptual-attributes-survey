"""
Setup script — run once to prepare data from the original index.html.

Usage:
    python setup_data.py /path/to/original/index.html

This will:
  1. Parse the house data (H) and taxonomy (TX) from the HTML
  2. Randomly select houses and allocate them into 10 lots
  3. Generate user accounts (user1–user10 + admin)
  4. Write everything into data/
"""

import json, re, os, sys, random, hashlib

SEED = 42  # Reproducible randomisation

def hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def main(html_path):
    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()

    # --- Extract JS data ---
    h_match  = re.search(r'const H=(\[.*?\]);\s*(?:const|var|let|\n)', content, re.DOTALL)
    tx_match = re.search(r'const TX=(\[.*?\]);\s*(?:const|var|let|\n)', content, re.DOTALL)
    fl_match = re.search(r'const FL=(\{.*?\});', content)
    sl_match = re.search(r'const SL=(\{.*?\});', content)

    if not h_match or not tx_match:
        print("ERROR: Could not find H or TX arrays in the HTML.")
        sys.exit(1)

    houses = json.loads(h_match.group(1))
    taxonomy = json.loads(tx_match.group(1))
    fl = json.loads(fl_match.group(1)) if fl_match else {}
    sl = json.loads(sl_match.group(1)) if sl_match else {}

    print(f"Found {len(houses)} houses, {len(taxonomy)} taxonomy entries")

    # --- Select & allocate houses ---
    random.seed(SEED)
    n_houses = len(houses)
    # We have 44 houses; the user asked for 100 but that's more than available.
    # We use all available houses and distribute across 10 lots.
    selected = list(houses)
    random.shuffle(selected)

    n_lots = 10
    lots = {str(i+1): [] for i in range(n_lots)}
    for idx, h in enumerate(selected):
        lot_id = str((idx % n_lots) + 1)
        lots[lot_id].append(h["id"])

    for lot_id, hids in lots.items():
        print(f"  Lot {lot_id}: {len(hids)} houses → {hids}")

    # --- Generate users ---
    passwords = {
        "user1":  "Maple2024!",
        "user2":  "Birch2024!",
        "user3":  "Cedar2024!",
        "user4":  "Aspen2024!",
        "user5":  "Larch2024!",
        "user6":  "Olive2024!",
        "user7":  "Rowan2024!",
        "user8":  "Hazel2024!",
        "user9":  "Alder2024!",
        "user10": "Willow2024!",
    }
    users = {}
    for i in range(1, 11):
        uname = f"user{i}"
        users[uname] = {
            "password_hash": hash_pw(passwords[uname]),
            "lot_id": i,
            "is_admin": False
        }
    # Admin account
    users["admin"] = {
        "password_hash": hash_pw("alexkoen"),
        "lot_id": None,
        "is_admin": True
    }

    # --- Write data ---
    data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    os.makedirs(data_dir, exist_ok=True)

    with open(os.path.join(data_dir, "houses.json"), "w") as f:
        json.dump(selected, f)
    with open(os.path.join(data_dir, "taxonomy.json"), "w") as f:
        json.dump(taxonomy, f)
    with open(os.path.join(data_dir, "lots.json"), "w") as f:
        json.dump(lots, f)
    with open(os.path.join(data_dir, "users.json"), "w") as f:
        json.dump(users, f)
    with open(os.path.join(data_dir, "labels.json"), "w") as f:
        json.dump({"FL": fl, "SL": sl}, f)

    # --- Print credentials ---
    print("\n" + "="*60)
    print("USER CREDENTIALS")
    print("="*60)
    for uname, pw in passwords.items():
        lot = users[uname]["lot_id"]
        n = len(lots[str(lot)])
        print(f"  {uname:8s}  pwd: {pw:14s}  lot {lot:2d}  ({n} houses)")
    print(f"  {'admin':8s}  pwd: {'alexkoen':14s}  (all lots)")
    print("="*60)
    print(f"\nData written to {data_dir}/")
    print("Now run:  python app.py")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python setup_data.py /path/to/index.html")
        sys.exit(1)
    main(sys.argv[1])
