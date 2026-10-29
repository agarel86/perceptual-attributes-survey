# House Perceptual Attribute Survey

Flask survey app (login + SQLite + EN/FR/NL) for validating AI perceptual attributes.

## Run locally

```bash
pip install -r requirements.txt
python app.py
# http://localhost:5000
```

## Accounts

| User | Password |
|------|----------|
| user1 | Maple2024! |
| user2 | Birch2024! |
| user3 | Cedar2024! |
| user4 | Aspen2024! |
| user5 | Larch2024! |
| user6 | Olive2024! |
| user7 | Rowan2024! |
| user8 | Hazel2024! |
| user9 | Alder2024! |
| user10 | Willow2024! |
| admin | alexkoen |

## Deploy (Railway / Render)

- Root = this folder
- Start command: `gunicorn -w 1 -b 0.0.0.0:$PORT app:app`
- Set `SURVEY_BACKUP_GITHUB_REPO` and `SURVEY_BACKUP_GITHUB_TOKEN` so answers survive free-tier sleep (private repo JSON backup). Do not rely on local `survey.db` alone.

Images: ~110 MB under `images/`.
