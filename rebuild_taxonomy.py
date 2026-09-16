"""
Rebuild taxonomy.json + labels.json from the paper's actual taxonomy (taxonomy_last.txt).
11 families, 38 attributes — exactly as published in the SSRN paper.
"""
import json, re, os

PAPER_TX = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                        "taxonomy_last.txt")
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

with open(PAPER_TX, "r", encoding="utf-8") as f:
    paper = json.load(f)

taxonomy = []
fl_labels = {}  # section key -> display name

for fam in paper["families"]:
    fam_name = fam["family_of_perceptual_attribute"]
    sec_key = fam_name.replace(" & ", "_and_").replace(" ", "_")
    fl_labels[sec_key] = fam_name

    for attr in fam["attributes"]:
        raw_name = attr["attribute_name"]
        # CamelCase -> snake_case for variable name
        vn = re.sub(r"(?<!^)(?=[A-Z])", "_", raw_name).lower()
        # CamelCase -> spaced for display
        display = re.sub(r"(?<!^)(?=[A-Z])", " ", raw_name)

        priority = attr.get("priority", "first_order")
        order = "first" if "first" in priority else "second"

        taxonomy.append({
            "vn": vn,
            "feat": display,
            "sec": sec_key,
            "sub": sec_key,
            "def": attr.get("definition", ""),
            "rat": attr.get("rationale", ""),
            "cues": [],
            "psy": [],
            "ord": order,
        })

# Write taxonomy.json
with open(os.path.join(DATA_DIR, "taxonomy.json"), "w", encoding="utf-8") as f:
    json.dump(taxonomy, f, ensure_ascii=False, indent=2)

# Write labels.json  (FL = section labels, SL = subcategory labels; here sec==sub)
labels = {"FL": fl_labels, "SL": dict(fl_labels)}
with open(os.path.join(DATA_DIR, "labels.json"), "w", encoding="utf-8") as f:
    json.dump(labels, f, ensure_ascii=False, indent=2)

# Clear i18n files (they referenced the old 59-attr taxonomy)
for fn in ("taxonomy_i18n.json", "labels_i18n.json"):
    p = os.path.join(DATA_DIR, fn)
    if os.path.exists(p):
        os.remove(p)
        print(f"  Removed {fn}")

print(f"Done — {len(taxonomy)} attributes across {len(fl_labels)} families")
for sec, name in fl_labels.items():
    n = sum(1 for a in taxonomy if a["sec"] == sec)
    print(f"  {name}: {n} attributes")
