# Tavla

Dokumentasjonsverktøy for elektriske installasjoner i norske hjem. Laget for privatpersoner, fagfolk og installatører som vil ha oversikt over sikringsskap, kurser og tilkoblet utstyr.

## Funksjonalitet

- **Eiendommer og skap** — flere sikringsskap per eiendom
- **Skapoversikt** — visuell DIN-skinne-visning med modulplassering (automatsikringer, jordfeilbrytere, kombibryere, Shelly, Dynalite, Shelly, hovedbryter m.fl.)
- **Kursdokumentasjon** — kabeltype, tverrsnitt, antall ledere, lengde, rom og kommentar
- **Koblingspunkter** — stikkontakter, lamper, brytere, koblingsbokser etc. med filoppplasting (JPG, PNG, PDF)
- **Fastmontert utstyr** — varmekabler, elbillader, varmepumpe, varmtvannsbereder etc. med effektangivelse
- **Kanalregister** — relé- og dimmerkanaler for styringsutstyr (Dynalite, Shelly) med watt per kanal og totalsum
- **Endringslogg** — logg over utførte arbeider per kurs

Planlagt: PDF-eksport, Cloudflare R2-synkronisering, JWT-autentisering, installatørportal med delbare lenker.

## Stack

- **Backend:** FastAPI + SQLite (SQLModel) + Alembic
- **Frontend:** React + Vite + Tailwind CSS
- **Fillagring:** Lokal + Cloudflare R2 (fase 5)
- **Hosting:** Debian 13 LXC på Proxmox

## Kom i gang — utvikling

```bash
# Backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload

# Frontend (nytt terminalvindu)
cd frontend
npm install
npm run dev
```

API-dokumentasjon: `http://localhost:8000/docs`

## Installasjon på Proxmox

```bash
bash <(curl -s https://raw.githubusercontent.com/jonaskul/tavla/main/install.sh)
```

Scriptet henter tilgjengelige branches fra GitHub og oppretter en Debian 13 LXC automatisk.

## Oppdatering

```bash
bash /opt/tavla/update.sh
```

Henter ny kode, oppdaterer avhengigheter, kjører databasemigrasjoner og restarter tjenestene.

## Faseoversikt

| Fase | Innhold | Status |
|------|---------|--------|
| 1 | FastAPI + SQLite, CRUD, React-scaffold | ✅ |
| 2 | Visuell skapoversikt, DIN-skinne, modulplassering | ✅ |
| 3 | Kursdetaljer, koblingspunkter, filoppplasting, endringslogg | ✅ |
| 4 | Fastmontert utstyr, kanalregister, modultyper utvidet | ✅ |
| 5 | PDF-eksport, Cloudflare R2-sync | ⏳ |
| 6 | JWT-autentisering | ⏳ |
| 7 | Installatørportal med delbare lenker | ⏳ |

## Språkkonvensjon

| Lag | Språk |
|-----|-------|
| UI | Norsk |
| Kode, modeller, API, kommentarer | Engelsk |
| Git commits | Engelsk |

## Repo

- GitHub: https://github.com/jonaskul/tavla
- Branch-strategi: `main` → produksjon, `feature/faseN` → aktiv utvikling
