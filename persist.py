"""Durable survey-answer backup on GitHub (CSV + JSON, survives Render sleep)."""
import base64
import csv
import io
import json
import os
import threading
import time
import urllib.error
import urllib.request

REPO = os.environ.get("SURVEY_BACKUP_GITHUB_REPO", "").strip()
TOKEN = os.environ.get("SURVEY_BACKUP_GITHUB_TOKEN", "").strip()
JSON_PATH = os.environ.get("SURVEY_BACKUP_PATH", "survey_answers.json").strip() or "survey_answers.json"
VAL_CSV = "csv/attribute_validation.csv"
SCORE_CSV = "csv/house_scoring.csv"
LOG_CSV = "csv/answer_log.csv"
BRANCH = os.environ.get("SURVEY_BACKUP_BRANCH", "main").strip() or "main"

VAL_FIELDS = ["username", "variable_name", "relevant", "order_opinion", "comment", "updated_at"]
SCORE_FIELDS = ["username", "house_id", "variable_name", "user_grade", "updated_at"]
LOG_FIELDS = [
    "logged_at",
    "kind",
    "username",
    "house_id",
    "variable_name",
    "relevant",
    "order_opinion",
    "user_grade",
    "comment",
    "updated_at",
]

_lock = threading.Lock()


def enabled():
    return bool(REPO and TOKEN)


def _api(method, url, payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "perceptual-attributes-survey")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            if resp.status == 204:
                return {}
            raw = resp.read()
            if not raw:
                return {}
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        err = RuntimeError(f"GitHub {method} {e.code}: {body[:500]}")
        err.status = e.code
        raise err from e


def _repo_url(path):
    return f"https://api.github.com/repos/{REPO}/{path}"


def _rows_to_csv(fields, rows):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow({k: r.get(k, "") if r.get(k) is not None else "" for k in fields})
    return buf.getvalue()


def _csv_to_rows(text, fields):
    if not text or not text.strip():
        return []
    r = csv.DictReader(io.StringIO(text))
    out = []
    for row in r:
        out.append({k: (row.get(k) or "") for k in fields})
    return out


def _get_file_text(path):
    try:
        data = _api("GET", _repo_url(f"contents/{path}?ref={BRANCH}"))
    except RuntimeError as e:
        if getattr(e, "status", None) == 404:
            return None
        raise
    return base64.b64decode(data["content"].encode("ascii")).decode("utf-8")


def load_all():
    """Return {attribute_validation, house_scoring} from JSON, else from CSVs."""
    if not enabled():
        return None
    val, sco = [], []
    try:
        raw = _get_file_text(JSON_PATH)
        if raw:
            content = json.loads(raw)
            val = content.get("attribute_validation") or []
            sco = content.get("house_scoring") or []
    except Exception:
        val, sco = [], []
    if not val:
        csv_text = _get_file_text(VAL_CSV)
        if csv_text:
            val = _csv_to_rows(csv_text, VAL_FIELDS)
    if not sco:
        csv_text = _get_file_text(SCORE_CSV)
        if csv_text:
            sco = _csv_to_rows(csv_text, SCORE_FIELDS)
    return {"attribute_validation": val, "house_scoring": sco}


def _log_line(kind, row):
    return {
        "logged_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "kind": kind,
        "username": row.get("username", ""),
        "house_id": row.get("house_id", ""),
        "variable_name": row.get("variable_name", ""),
        "relevant": row.get("relevant", ""),
        "order_opinion": row.get("order_opinion", ""),
        "user_grade": row.get("user_grade", ""),
        "comment": row.get("comment", ""),
        "updated_at": row.get("updated_at", ""),
    }


def _commit_files(files, message):
    """Commit several text files on BRANCH in one git commit."""
    ref = _api("GET", _repo_url(f"git/ref/heads/{BRANCH}"))
    commit_sha = ref["object"]["sha"]
    commit = _api("GET", _repo_url(f"git/commits/{commit_sha}"))
    tree = _api(
        "POST",
        _repo_url("git/trees"),
        {
            "base_tree": commit["tree"]["sha"],
            "tree": [
                {"path": path, "mode": "100644", "type": "blob", "content": content}
                for path, content in files.items()
            ],
        },
    )
    new_commit = _api(
        "POST",
        _repo_url("git/commits"),
        {"message": message, "tree": tree["sha"], "parents": [commit_sha]},
    )
    try:
        _api("PATCH", _repo_url(f"git/refs/heads/{BRANCH}"), {"sha": new_commit["sha"]})
    except RuntimeError as e:
        if getattr(e, "status", None) in (409, 422):
            raise
        raise
    return new_commit


def _snapshot_files(val_rows, score_rows, extra_log_row=None):
    log_text = _get_file_text(LOG_CSV) or _rows_to_csv(LOG_FIELDS, [])
    if extra_log_row:
        # Append without rewriting the whole history incorrectly if file has no header
        if not log_text.strip():
            log_text = _rows_to_csv(LOG_FIELDS, [])
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=LOG_FIELDS, extrasaction="ignore", lineterminator="\n")
        w.writerow({k: extra_log_row.get(k, "") for k in LOG_FIELDS})
        log_text = log_text.rstrip() + "\n" + buf.getvalue()
        if not log_text.endswith("\n"):
            log_text += "\n"
    json_body = {
        "attribute_validation": val_rows,
        "house_scoring": score_rows,
    }
    return {
        JSON_PATH: json.dumps(json_body, ensure_ascii=False, indent=2) + "\n",
        VAL_CSV: _rows_to_csv(VAL_FIELDS, val_rows),
        SCORE_CSV: _rows_to_csv(SCORE_FIELDS, score_rows),
        LOG_CSV: log_text,
    }


def _upsert_list(rows, key_fn, row):
    k = key_fn(row)
    out = [r for r in rows if key_fn(r) != k]
    out.append(row)
    out.sort(key=lambda r: tuple(str(r.get(x, "")) for x in ("username", "house_id", "variable_name")))
    return out


def upsert(kind, row, message=None):
    if not enabled():
        return False
    key_fn = {
        "attribute_validation": lambda r: (r.get("username"), r.get("variable_name")),
        "house_scoring": lambda r: (r.get("username"), r.get("house_id"), r.get("variable_name")),
    }[kind]
    last_err = None
    for attempt in range(8):
        with _lock:
            try:
                bundle = load_all() or {"attribute_validation": [], "house_scoring": []}
                bundle[kind] = _upsert_list(bundle.get(kind, []), key_fn, row)
                files = _snapshot_files(
                    bundle.get("attribute_validation") or [],
                    bundle.get("house_scoring") or [],
                    extra_log_row=_log_line(kind, row),
                )
                _commit_files(
                    files,
                    message or f"save {kind} {row.get('username')} {row.get('variable_name')}",
                )
                return True
            except RuntimeError as e:
                last_err = e
                if getattr(e, "status", None) in (409, 422):
                    time.sleep(0.25 * (attempt + 1))
                    continue
                raise
    raise last_err or RuntimeError("GitHub CSV backup failed")


def replace_all(validation_rows, scoring_rows, message="survey replace"):
    if not enabled():
        return False
    last_err = None
    val = list(validation_rows)
    sco = list(scoring_rows)
    for attempt in range(8):
        with _lock:
            try:
                files = _snapshot_files(val, sco, extra_log_row=_log_line("replace_all", {}))
                _commit_files(files, message)
                return True
            except RuntimeError as e:
                last_err = e
                if getattr(e, "status", None) in (409, 422):
                    time.sleep(0.25 * (attempt + 1))
                    continue
                raise
    raise last_err or RuntimeError("GitHub CSV backup replace failed")


def dump_from_db(db, message="session flush CSV snapshot"):
    """Write the full sqlite tables to GitHub CSVs in one commit."""
    if not enabled():
        return False
    val = [
        dict(r)
        for r in db.execute(
            "SELECT username, variable_name, relevant, order_opinion, comment, updated_at FROM attribute_validation ORDER BY username, variable_name"
        )
    ]
    sco = [
        dict(r)
        for r in db.execute(
            "SELECT username, house_id, variable_name, user_grade, updated_at FROM house_scoring ORDER BY username, house_id, variable_name"
        )
    ]
    return replace_all(val, sco, message=message)
