"""Wipe all survey responses from the SQLite DB (local or SURVEY_DB_PATH)."""
import os
import sqlite3

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.environ.get("SURVEY_DB_PATH") or os.path.join(BASE, "survey.db")

def wipe(db_path=DB):
    conn = sqlite3.connect(db_path)
    conn.execute("DELETE FROM attribute_validation")
    conn.execute("DELETE FROM house_scoring")
    try:
        conn.execute(
            "DELETE FROM sqlite_sequence WHERE name IN ('attribute_validation','house_scoring')"
        )
    except sqlite3.Error:
        pass
    conn.commit()
    v = conn.execute("SELECT COUNT(*) FROM attribute_validation").fetchone()[0]
    s = conn.execute("SELECT COUNT(*) FROM house_scoring").fetchone()[0]
    conn.close()
    return v, s

if __name__ == "__main__":
    print("Wiping", DB)
    v, s = wipe()
    print(f"Done. validation={v} scoring={s}")
