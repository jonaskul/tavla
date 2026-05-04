# ElDok

Dokumentasjonsverktøy for elektriske installasjoner i norske hjem.

## Stack

- **Backend:** FastAPI + SQLite (SQLModel)
- **Frontend:** React + Vite + Tailwind CSS
- **Fillagring:** Lokal + Cloudflare R2 (sync)
- **Hosting:** LXC på Proxmox

## Kom i gang

```bash
# Klon repoet
git clone https://github.com/DITT-BRUKERNAVN/eldok.git
cd eldok

# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend (nytt terminalvindu)
cd frontend
npm install
npm run dev
```

API-dokumentasjon tilgjengelig på `http://localhost:8000/docs`

## Mappestruktur

```
eldok/
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── models/
│   ├── routers/
│   ├── services/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── api/
│   │   └── i18n/           # Norske UI-tekster
│   └── package.json
├── uploads/
└── PLAN.md
```

## Språk

- **UI:** Norsk
- **Kode, modeller, API, kommentarer:** Engelsk
