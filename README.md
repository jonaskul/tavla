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

## Utrulling som SaaS

Gjelder grenen `feature/saas-tenancy`. Den forutsetter en **tom database** —
migrasjonene er slått sammen til én initiell, og hele skjemaet krever
`organization_id`. Den kan ikke kjøres mot en eksisterende Tavla-base.

### Domenefellen, les denne først

Sesjonen er en `HttpOnly`-cookie med `SameSite=Lax`, som er det som beskytter
skrivende endepunkter mot forespørsler fra andre nettsteder. Men nettleseren
avgjør «samme nettsted» ut fra registrerbart domene:

| Frontend | API | Virker med Lax? |
|---|---|---|
| `app.tavla.no` | `api.tavla.no` | ✅ samme nettsted |
| `tavla.pages.dev` | `tavla.fly.dev` | ❌ ulike nettsteder |

**Legg begge under ett domene.** Gjør du ikke det, må `COOKIE_SAMESITE=none`,
og da mister du CSRF-beskyttelsen Lax ga deg.

### Steg

1. **Database.** Neon eller Supabase. Appen skal koble til som en rolle som
   verken er superbruker eller har `BYPASSRLS` — begge omgår rad-nivå
   sikkerheten, som er hele isolasjonen mellom kunder.
2. **E-post.** Resend-nøkkel, og SPF, DKIM og DMARC på avsenderdomenet.
   Dette er den eneste avhengigheten som ikke kan testes lokalt, og havner
   koden i søppelpost kan ingen logge inn i det hele tatt.
3. **API.** `Dockerfile` kjører `alembic upgrade head` før serveren starter.
   Sett miljøvariablene fra `.env.example`; mangler noe, nekter den å starte
   og sier hva.
4. **Frontend.** `npm run build` i `frontend/`, deploy `dist/` til Pages.
   Sett `CORS_ORIGINS` til frontendens opphav.
5. **Logg inn.** Første innlogging oppretter kontoen og organisasjonen din.
6. **Importer.** `POST /api/export` med en JSON-fil fra `GET /api/export/{id}`.
   Ta en **fersk** eksport fra en eventuell gammel installasjon: formatet før
   versjon 2 manglet hele skapoversikten.

### Kjent gjenstående

`organization`, `app_user` og `membership` har ikke rad-nivå sikkerhet.
Autentisering må lese dem før det finnes en innlogget bruker, så en regel som
nøkler på brukeren ville låst seg selv ute. De er i dag beskyttet av at ingen
endepunkter eksponerer dem. Riktig løsning er en egen databaserolle for
autentiseringsoppslaget.
