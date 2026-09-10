"""
House Perceptual Attribute Rating Survey
=========================================
Flask app with user login, SQLite persistence, and EN/FR/NL UI.

Usage:
    python app.py
    python app.py --port 8080
"""

import os, json, csv, io, hashlib, sqlite3, argparse
from datetime import datetime
from functools import wraps
from flask import (Flask, render_template, request, redirect, url_for,
                   session, jsonify, Response, g, send_from_directory)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("SURVEY_DB_PATH") or os.path.join(BASE_DIR, "survey.db")
DATA_DIR = os.path.join(BASE_DIR, "data")
IMAGES_DIR = os.path.join(BASE_DIR, "images")
SECRET_FILE = os.path.join(BASE_DIR, ".secret_key")

# Ensure DB parent folder exists (e.g. /data on Railway volume)
os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)) or ".", exist_ok=True)

def _get_secret():
    if os.path.exists(SECRET_FILE):
        with open(SECRET_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()
    key = hashlib.sha256(os.urandom(32)).hexdigest()
    with open(SECRET_FILE, "w", encoding="utf-8") as f:
        f.write(key)
    return key

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = _get_secret()
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.jinja_env.auto_reload = True

USERS = {}
LOT_HOUSES = {}
HOUSES = {}
TAXONOMY = []
FL = {}
SL = {}
TAXONOMY_I18N = {}
LABELS_I18N = {"FL": {}, "SL": {}}
GRADES = ["Excellent", "Good", "Average", "Bad", "Terrible", "Unknown"]
SUPPORTED_LANGS = ("en", "fr", "nl")


def load_data():
    global USERS, LOT_HOUSES, HOUSES, TAXONOMY, FL, SL, TAXONOMY_I18N, LABELS_I18N
    with open(os.path.join(DATA_DIR, "users.json"), encoding="utf-8") as f:
        USERS = json.load(f)
    with open(os.path.join(DATA_DIR, "lots.json"), encoding="utf-8") as f:
        LOT_HOUSES = json.load(f)
    with open(os.path.join(DATA_DIR, "houses.json"), encoding="utf-8") as f:
        houses_list = json.load(f)
        HOUSES = {h["id"]: h for h in houses_list}
        # Normalise image prefix to Flask-served /images/...
        for h in HOUSES.values():
            hid = h["id"]
            h["ip"] = f"/images/{hid}/"
    with open(os.path.join(DATA_DIR, "taxonomy.json"), encoding="utf-8") as f:
        TAXONOMY = json.load(f)
    with open(os.path.join(DATA_DIR, "labels.json"), encoding="utf-8") as f:
        labels = json.load(f)
        FL = labels["FL"]
        SL = labels["SL"]
    tx_i18n_path = os.path.join(DATA_DIR, "taxonomy_i18n.json")
    if os.path.exists(tx_i18n_path):
        with open(tx_i18n_path, encoding="utf-8") as f:
            TAXONOMY_I18N = json.load(f)
    lb_i18n_path = os.path.join(DATA_DIR, "labels_i18n.json")
    if os.path.exists(lb_i18n_path):
        with open(lb_i18n_path, encoding="utf-8") as f:
            LABELS_I18N = json.load(f)


def localized_labels(lang):
    if lang not in ("fr", "nl"):
        return FL, SL
    fl = {
        k: LABELS_I18N.get("FL", {}).get(k, {}).get(lang) or v
        for k, v in FL.items()
    }
    sl = {
        k: LABELS_I18N.get("SL", {}).get(k, {}).get(lang) or v
        for k, v in SL.items()
    }
    return fl, sl


def localized_taxonomy(lang):
    if lang not in ("fr", "nl"):
        return [
            {
                **a,
                "feat": a["feat"].replace("_", " "),
                "label": a["feat"].replace("_", " "),
            }
            for a in TAXONOMY
        ]
    out = []
    for a in TAXONOMY:
        tr = TAXONOMY_I18N.get(a["vn"], {})
        feat = (tr.get("feat") or {}).get(lang) or a["feat"].replace("_", " ")
        item = {
            **a,
            "feat": feat,
            "label": feat,
            "def": (tr.get("def") or {}).get(lang) or a.get("def", ""),
            "rat": (tr.get("rat") or {}).get(lang) or a.get("rat", ""),
            "cues": (tr.get("cues") or {}).get(lang) or a.get("cues", []),
        }
        out.append(item)
    return out


def localize_house_feats(house, lang):
    """Return a shallow copy of house with localized feature display names."""
    if lang not in ("fr", "nl"):
        h = dict(house)
        h["feats"] = [
            {**f, "feat": f["feat"].replace("_", " ")} for f in house.get("feats", [])
        ]
        return h
    tx_map = {a["vn"]: a for a in localized_taxonomy(lang)}
    h = dict(house)
    feats = []
    for f in house.get("feats", []):
        loc = tx_map.get(f["vn"], {})
        feats.append({**f, "feat": loc.get("feat", f["feat"].replace("_", " "))})
    h["feats"] = feats
    return h


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA busy_timeout=5000")
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("""CREATE TABLE IF NOT EXISTS attribute_validation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        variable_name TEXT NOT NULL,
        relevant TEXT,
        order_opinion TEXT,
        comment TEXT,
        updated_at TEXT NOT NULL,
        UNIQUE(username, variable_name)
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS house_scoring (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        house_id TEXT NOT NULL,
        variable_name TEXT NOT NULL,
        user_grade TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(username, house_id, variable_name)
    )""")
    db.commit()

    # One-shot clean sheet before real fieldwork (marker lives next to the DB / volume)
    marker = os.path.join(os.path.dirname(os.path.abspath(DB_PATH)), ".survey_clean_sheet_v1")
    force = os.environ.get("SURVEY_FORCE_CLEAN", "").strip().lower() in ("1", "true", "yes")
    if force or not os.path.exists(marker):
        db.execute("DELETE FROM attribute_validation")
        db.execute("DELETE FROM house_scoring")
        try:
            db.execute(
                "DELETE FROM sqlite_sequence WHERE name IN ('attribute_validation','house_scoring')"
            )
        except sqlite3.Error:
            pass
        db.commit()
        try:
            with open(marker, "w", encoding="utf-8") as f:
                f.write(datetime.utcnow().isoformat() + "\n")
        except OSError as e:
            print("Could not write clean-sheet marker:", e)
        print("Clean sheet: all validation and scoring responses wiped.")

    db.close()


def wipe_all_responses(db=None):
    close = False
    if db is None:
        db = sqlite3.connect(DB_PATH)
        close = True
    db.execute("DELETE FROM attribute_validation")
    db.execute("DELETE FROM house_scoring")
    try:
        db.execute(
            "DELETE FROM sqlite_sequence WHERE name IN ('attribute_validation','house_scoring')"
        )
    except sqlite3.Error:
        pass
    db.commit()
    if close:
        db.close()


def hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()


def current_lang():
    lang = session.get("lang") or request.cookies.get("lang") or "en"
    return lang if lang in SUPPORTED_LANGS else "en"


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user" not in session:
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user" not in session:
            return redirect(url_for("login"))
        if not USERS.get(session["user"], {}).get("is_admin"):
            return "Forbidden", 403
        return f(*args, **kwargs)
    return decorated


@app.route("/set-lang/<lang>")
def set_lang(lang):
    if lang not in SUPPORTED_LANGS:
        lang = "en"
    session["lang"] = lang
    tab = request.args.get("tab", "").strip()
    allowed = {"welcome", "validate", "scoring", "admin"}
    target = url_for("index")
    if tab in allowed:
        target = f"{target}?tab={tab}"
    resp = redirect(target)
    resp.set_cookie("lang", lang, max_age=60 * 60 * 24 * 365)
    return resp


@app.route("/images/<path:filename>")
@login_required
def serve_image(filename):
    return send_from_directory(IMAGES_DIR, filename)


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        u = request.form.get("username", "").strip()
        p = request.form.get("password", "").strip()
        user = USERS.get(u)
        if user and user["password_hash"] == hash_pw(p):
            session["user"] = u
            return redirect(url_for("index"))
        error = "auth_error"
    return render_template("login.html", error=error, lang=current_lang())


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def index():
    user = USERS[session["user"]]
    return render_template(
        "index.html",
        username=session["user"],
        is_admin=user["is_admin"],
        lot_id=user.get("lot_id"),
        lang=current_lang(),
    )


@app.route("/validate")
@login_required
def validate_tab():
    db = get_db()
    lang = current_lang()
    rows = db.execute(
        "SELECT variable_name, relevant, order_opinion, comment FROM attribute_validation WHERE username=?",
        (session["user"],),
    ).fetchall()
    # Only expose answers that were actually chosen (avoid empty rows looking filled)
    saved = {}
    for r in rows:
        d = dict(r)
        if not d.get("relevant"):
            continue
        saved[d["variable_name"]] = d
    fl, sl = localized_labels(lang)
    return jsonify(taxonomy=localized_taxonomy(lang), saved=saved, FL=fl, SL=sl)


@app.route("/houses")
@login_required
def houses_list():
    user = USERS[session["user"]]
    if user["is_admin"]:
        lot = request.args.get("lot", "1")
        ids = LOT_HOUSES.get(lot, [])
    else:
        ids = LOT_HOUSES.get(str(user["lot_id"]), [])
    houses = []
    for hid in ids:
        h = HOUSES.get(hid)
        if h:
            houses.append({"id": h["id"], "img_count": len(h["imgs"])})
    return jsonify(
        houses=houses,
        lot_id=user.get("lot_id"),
        all_lots=list(LOT_HOUSES.keys()) if user["is_admin"] else None,
    )


@app.route("/house/<house_id>")
@login_required
def house_detail(house_id):
    h = HOUSES.get(house_id)
    if not h:
        return jsonify(error="House not found"), 404
    db = get_db()
    lang = current_lang()
    rows = db.execute(
        "SELECT variable_name, user_grade FROM house_scoring WHERE username=? AND house_id=?",
        (session["user"], house_id),
    ).fetchall()
    saved = {r["variable_name"]: r["user_grade"] for r in rows if r["user_grade"]}
    fl, sl = localized_labels(lang)
    return jsonify(
        house=localize_house_feats(h, lang),
        saved=saved,
        grades=GRADES,
        FL=fl,
        SL=sl,
    )


@app.route("/save/validation", methods=["POST"])
@login_required
def save_validation():
    data = request.get_json()
    vn = data.get("variable_name")
    db = get_db()
    db.execute(
        """INSERT INTO attribute_validation
        (username, variable_name, relevant, order_opinion, comment, updated_at)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(username, variable_name) DO UPDATE SET
            relevant=excluded.relevant,
            order_opinion=excluded.order_opinion,
            comment=excluded.comment,
            updated_at=excluded.updated_at
    """,
        (
            session["user"],
            vn,
            data.get("relevant"),
            data.get("order_opinion"),
            data.get("comment", ""),
            datetime.utcnow().isoformat(),
        ),
    )
    db.commit()
    return jsonify(ok=True)


@app.route("/save/score", methods=["POST"])
@login_required
def save_score():
    data = request.get_json()
    db = get_db()
    db.execute(
        """INSERT INTO house_scoring
        (username, house_id, variable_name, user_grade, updated_at)
        VALUES (?,?,?,?,?)
        ON CONFLICT(username, house_id, variable_name) DO UPDATE SET
            user_grade=excluded.user_grade,
            updated_at=excluded.updated_at
    """,
        (
            session["user"],
            data["house_id"],
            data["variable_name"],
            data["user_grade"],
            datetime.utcnow().isoformat(),
        ),
    )
    db.commit()
    return jsonify(ok=True)


@app.route("/progress")
@login_required
def progress():
    db = get_db()
    user = session["user"]
    val_rows = db.execute(
        "SELECT relevant, order_opinion FROM attribute_validation WHERE username=?",
        (user,),
    ).fetchall()
    val_count = 0
    for r in val_rows:
        if r["relevant"] == "no":
            val_count += 1
        elif r["relevant"] == "yes" and r["order_opinion"] in ("first", "second"):
            val_count += 1
    score_count = db.execute(
        "SELECT COUNT(*) as c FROM house_scoring WHERE username=? AND user_grade!=''",
        (user,),
    ).fetchone()["c"]
    total_attrs = len(TAXONOMY)
    u = USERS[user]
    lot_houses = LOT_HOUSES.get(str(u.get("lot_id", "")), [])
    if u.get("is_admin"):
        lot_houses = [hid for ids in LOT_HOUSES.values() for hid in ids]
    total_scores = len(lot_houses) * total_attrs
    return jsonify(
        validation={"done": val_count, "total": total_attrs},
        scoring={"done": score_count, "total": total_scores},
    )


@app.route("/admin/export/validation")
@admin_required
def export_validation():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM attribute_validation ORDER BY username, variable_name"
    ).fetchall()
    si = io.StringIO()
    w = csv.writer(si)
    w.writerow(["username", "variable_name", "relevant", "order_opinion", "comment", "updated_at"])
    for r in rows:
        w.writerow(
            [r["username"], r["variable_name"], r["relevant"], r["order_opinion"], r["comment"], r["updated_at"]]
        )
    return Response(
        si.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=attribute_validation.csv"},
    )


@app.route("/admin/export/scoring")
@admin_required
def export_scoring():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM house_scoring ORDER BY username, house_id, variable_name"
    ).fetchall()
    si = io.StringIO()
    w = csv.writer(si)
    w.writerow(["username", "house_id", "variable_name", "user_grade", "updated_at"])
    for r in rows:
        w.writerow([r["username"], r["house_id"], r["variable_name"], r["user_grade"], r["updated_at"]])
    return Response(
        si.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=house_scoring.csv"},
    )


@app.route("/admin/export/combined")
@admin_required
def export_combined():
    db = get_db()
    si = io.StringIO()
    w = csv.writer(si)
    w.writerow(
        [
            "type",
            "username",
            "house_id",
            "variable_name",
            "feature_name",
            "ai_order",
            "section",
            "subcategory",
            "ai_grade",
            "ai_confidence",
            "relevant_for_valuation",
            "order_opinion",
            "user_grade",
            "comment",
            "updated_at",
        ]
    )
    tx_map = {t["vn"]: t for t in TAXONOMY}
    for r in db.execute("SELECT * FROM attribute_validation ORDER BY username").fetchall():
        t = tx_map.get(r["variable_name"], {})
        w.writerow(
            [
                "validation",
                r["username"],
                "",
                r["variable_name"],
                t.get("feat", ""),
                t.get("ord", ""),
                t.get("sec", ""),
                t.get("sub", ""),
                "",
                "",
                r["relevant"],
                r["order_opinion"],
                "",
                r["comment"],
                r["updated_at"],
            ]
        )
    for r in db.execute("SELECT * FROM house_scoring ORDER BY username, house_id").fetchall():
        h = HOUSES.get(r["house_id"], {})
        feat_map = {f["vn"]: f for f in h.get("feats", [])}
        f = feat_map.get(r["variable_name"], {})
        w.writerow(
            [
                "scoring",
                r["username"],
                r["house_id"],
                r["variable_name"],
                f.get("feat", ""),
                f.get("ord", ""),
                f.get("sec", ""),
                f.get("sub", ""),
                f.get("val", ""),
                f.get("conf", ""),
                "",
                "",
                r["user_grade"],
                "",
                r["updated_at"],
            ]
        )
    return Response(
        si.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=survey_results_combined.csv"},
    )


@app.route("/admin/dashboard")
@admin_required
def admin_dashboard():
    db = get_db()
    stats = []
    for uname, udata in USERS.items():
        if udata["is_admin"]:
            continue
        vc_rows = db.execute(
            "SELECT relevant, order_opinion FROM attribute_validation WHERE username=?",
            (uname,),
        ).fetchall()
        vc = 0
        for r in vc_rows:
            if r["relevant"] == "no":
                vc += 1
            elif r["relevant"] == "yes" and r["order_opinion"] in ("first", "second"):
                vc += 1
        sc = db.execute(
            "SELECT COUNT(*) as c FROM house_scoring WHERE username=? AND user_grade!=''",
            (uname,),
        ).fetchone()["c"]
        lot_h = LOT_HOUSES.get(str(udata.get("lot_id", "")), [])
        stats.append(
            {
                "username": uname,
                "lot_id": udata.get("lot_id"),
                "houses": len(lot_h),
                "val_done": vc,
                "val_total": len(TAXONOMY),
                "score_done": sc,
                "score_total": len(lot_h) * len(TAXONOMY),
            }
        )
    return jsonify(stats=stats)


@app.route("/admin/reset-all", methods=["POST"])
@admin_required
def admin_reset_all():
    """Delete every validation and scoring answer (clean sheet for all users)."""
    wipe_all_responses(get_db())
    return jsonify(ok=True, message="All responses cleared.")


# Load data + DB whenever the app starts (gunicorn OR python app.py)
init_db()
load_data()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()

    print(f"\n  Survey running at http://localhost:{args.port}")
    print(f"  Images: {IMAGES_DIR}")
    print(f"  Houses: {len(HOUSES)} | Attributes: {len(TAXONOMY)}")
    print(f"  Users: {len(USERS)}\n")
    app.run(host=args.host, port=args.port, debug=False)
