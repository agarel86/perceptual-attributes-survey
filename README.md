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
- Start command: `gunicorn -w 2 -b 0.0.0.0:$PORT app:app`
- Attach a **persistent disk** for `survey.db` if possible

Images: ~110 MB under `images/`.
