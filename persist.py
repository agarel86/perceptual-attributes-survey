"""Durable survey-answer backup on GitHub (survives Render free-tier sleep)."""
import base64
import json
import os
import threading
import time
import urllib.error
import urllib.request

REPO = os.environ.get("SURVEY_BACKUP_GITHUB_REPO", "").strip()
TOKEN = os.environ.get("SURVEY_BACKUP_GITHUB_TOKEN", "").strip()
PATH = os.environ.get("SURVEY_BACKUP_PATH", "survey_answers.json").strip() or "survey_answers.json"

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
            return json.load(resp)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        err = RuntimeError(f"GitHub {method} {e.code}: {body[:500]}")
        err.status = e.code
        raise err from e


def _contents_url():
    return f"https://api.github.com/repos/{REPO}/contents/{PATH}"


def load_all():
    """Return {attribute_validation, house_scoring, _sha} or empty stub."""
    if not enabled():
        return None
    try:
        data = _api("GET", _contents_url())
    except RuntimeError as e:
        if getattr(e, "status", None) == 404:
            return {"attribute_validation": [], "house_scoring": [], "_sha": None}
        raise
    raw = base64.b64decode(data["content"].encode("ascii")).decode("utf-8")
    content = json.loads(raw)
    content.setdefault("attribute_validation", [])
    content.setdefault("house_scoring", [])
    content["_sha"] = data.get("sha")
    return content


def _put(bundle, sha, message):
    body = {
        "attribute_validation": bundle.get("attribute_validation", []),
        "house_scoring": bundle.get("house_scoring", []),
    }
    encoded = base64.b64encode(json.dumps(body, ensure_ascii=False, indent=2).encode("utf-8")).decode("ascii")
    payload = {"message": message, "content": encoded}
    if sha:
        payload["sha"] = sha
    return _api("PUT", _contents_url(), payload)


def _upsert_list(rows, key_fn, row):
    k = key_fn(row)
    out = [r for r in rows if key_fn(r) != k]
    out.append(row)
    out.sort(key=lambda r: tuple(str(r.get(x, "")) for x in ("username", "house_id", "variable_name")))
    return out


def upsert(kind, row, message=None):
    """Merge one validation or scoring row into GitHub JSON. kind is table name."""
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
                bundle = load_all()
                sha = bundle.get("_sha")
                bundle[kind] = _upsert_list(bundle.get(kind, []), key_fn, row)
                _put(bundle, sha, message or f"survey {kind} {row.get('username')}")
                return True
            except RuntimeError as e:
                last_err = e
                if getattr(e, "status", None) in (409, 422):
                    time.sleep(0.25 * (attempt + 1))
                    continue
                raise
    raise last_err or RuntimeError("GitHub backup failed")


def replace_all(validation_rows, scoring_rows, message="survey replace"):
    if not enabled():
        return False
    last_err = None
    for attempt in range(8):
        with _lock:
            try:
                bundle = load_all()
                sha = bundle.get("_sha")
                _put(
                    {"attribute_validation": list(validation_rows), "house_scoring": list(scoring_rows)},
                    sha,
                    message,
                )
                return True
            except RuntimeError as e:
                last_err = e
                if getattr(e, "status", None) in (409, 422):
                    time.sleep(0.25 * (attempt + 1))
                    continue
                raise
    raise last_err or RuntimeError("GitHub backup replace failed")
