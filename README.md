# Tavla

Dokumentasjonsverktøy for elektriske installasjoner i norske hjem. Laget
for privatpersoner, fagfolk og installatører som vil ha oversikt over
sikringsskap, kurser og tilkoblet utstyr.

## Funksjonalitet

- **Anlegg og skap** — flere sikringsskap per anlegg
- **Skapoversikt** — visuell DIN-skinne-visning med modulplassering
  (automatsikringer, jordfeilbrytere, kombibryere, Shelly, Dynalite,
  hovedbryter m.fl.)
- **Kursdokumentasjon** — kabeltype, tverrsnitt, antall ledere, lengde,
  rom og kommentar
- **Koblingspunkter** — stikkontakter, lamper, brytere, koblingsbokser
  etc. med filopplasting (JPG, PNG, PDF)
- **Fastmontert utstyr** — varmekabler, elbillader, varmepumpe,
  varmtvannsbereder etc. med effektangivelse
- **Kanalregister** — relé- og dimmerkanaler for styringsutstyr med watt
  per kanal og totalsum
- **Endringslogg** — logg over utførte arbeider per kurs
- **Import/eksport** — hele anlegget som JSON, begge veier
- **Innlogging med engangskode** — passordløst, og første innlogging
  oppretter kontoen
- **Flere kunder i samme installasjon** — hver organisasjon ser bare sitt

## To implementasjoner i samme repo

Repoet inneholder akkurat nå **to backender som svarer på samme API**.

| | Kjører på | Status |
|---|---|---|
| Python — `main.py`, `routers/`, `models.py` | FastAPI + PostgreSQL | Den som er i drift i dag |
| TypeScript — `workers/` | Cloudflare Workers + D1 + R2 | Omskriving, kontraktsuiten grønn |

Frontenden i `frontend/` er den samme for begge, og snakker med `/api`
under samme opphav.

**`contract/` er det som binder dem sammen.** Det er en testsuite som
snakker HTTP og ikke vet noe om hvilken implementasjon som svarer. Den ble
skrevet mot Python-versjonen mens den beviselig virket, og er definisjonen
på når omskrivingen er ferdig — ikke når koden ser riktig ut. Den dekker
alle 69 endepunkter, og en egen test feiler hvis et endepunkt ikke faktisk
ble truffet.

```bash
TAVLA_BASE_URL=http://127.0.0.1:8787 TAVLA_SESSION=<cookie> \
  python -m pytest contract/
```

`workers/DECISIONS.md` er loggen over hvorfor omskrivingen ser ut som den
gjør, økt for økt — inkludert hva som ble gitt fra seg og hvorfor.

## Kom i gang

### Bare for å rulle ut

Trenger ikke Python i det hele tatt.

```bash
git clone https://github.com/jonaskul/tavla
cd tavla/workers
npx wrangler login
./deploy.sh
```

Skriptet oppretter D1 og R2, skriver `database_id` inn i
`wrangler.toml`, genererer `SESSION_SECRET`, bygger frontenden, kjører
migrasjonene og ruller ut. Trygt å kjøre om igjen, og det stopper med en
forklaring hvis noe mangler.

Krever Node 20 eller nyere, og `openssl` (følger med på macOS og Linux;
på Windows: Git Bash eller WSL).

### Utvikling mot Workers-versjonen

```bash
cd workers
npm install
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply tavla --local
npx wrangler dev --local          # http://127.0.0.1:8787
```

`wrangler dev` serverer frontenden også, fra `frontend/dist` — bygg den
først med `npm ci && npm run build` i `frontend/`.

Innloggingskoden sendes ikke lokalt; den skrives til wrangler-loggen.

```bash
npm test          # typesjekk + 40 node-tester + 83 i ekte workerd
```

De to testprosjektene stiller ulike spørsmål. Node mot better-sqlite3
spør hva en spørringsbygger produserer. workerd mot ekte lokal D1 spør om
innlogging virker — cookies, WebCrypto, `fetch` og D1s egne særheter er
alle kjøretid, og en node-etterligning ville latt omskrivingen bli grønn
mens utrullingen feilet.

### Utvikling mot Python-versjonen

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload        # http://localhost:8000/docs

cd frontend && npm install && npm run dev
```

```bash
python -m pytest                 # 212 tester
cd frontend && npm test          # 71 tester
```

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
| `tavla.digibygg.io` | `tavla.digibygg.io/api` | ✅ samme opphav — ingen CORS |
| `tavla.digibygg.io` | `api.tavla.digibygg.io` | ✅ samme nettsted |
| `tavla.pages.dev` | `tavla.fly.dev` | ❌ ulike nettsteder |

**Legg begge under ett domene.** Gjør du ikke det, må `COOKIE_SAMESITE=none`,
og da mister du CSRF-beskyttelsen Lax ga deg.

Enkleste variant er øverste rad: server API-et under samme vert som
frontenden, så finnes det ingen cross-origin-forespørsel å konfigurere. La
da `CORS_ORIGINS` stå tom.

### Utrulling på Cloudflare Workers

Dette er veien framover, og den som `workers/deploy.sh` dekker.

Tidligere sto det her at Workers **ikke** kunne kjøre denne backenden.
Det stemte da: datalaget var SQLAlchemy, D1 nås gjennom en binding
framfor en databasedriver, og D1 har ingen row-level security — så
isolasjonen mellom kunder ville falt tilbake til å huske `WHERE`-filteret
hver gang, mønsteret som allerede hadde sviktet to ganger i denne
kodebasen.

Omskrivingen i `workers/` løste det siste ved å bygge et lag der en
uavgrenset spørring ikke lar seg uttrykke: rutehåndterere får aldri et
databasehåndtak, bare et `Tenant`-objekt som scoper alt. En test i
`workers/tests/architecture.test.ts` håndhever regelen mekanisk, så en
fjerde fil som vil jobbe uavgrenset må begrunnes i en diff.

Det er en erstatning for RLS, ikke det samme. Avveiningen står i
`workers/DECISIONS.md`.

Én worker serverer både frontenden og API-et. Det er ikke bare enklere —
det er også det som lar sesjonscookien bli stående på `SameSite=Lax`, jf.
tabellen over.

### Utrulling på egen server

Python-versjonen, som den er i drift i dag.

`Dockerfile` kjører `alembic upgrade head` før serveren starter.
`deploy/nginx.conf` serverer frontenden og proxyer `/api` til API-et på
samme vert, så det finnes ingen cross-origin-forespørsel, `CORS_ORIGINS`
kan stå tom, og cookien blir på `SameSite=Lax`.

Den konfigurasjonen tar også to ting Python-appen ikke gjør selv: den
avviser for store opplastinger før de når Python (som leser hele
forespørselen i minnet *før* den sjekker størrelsen), og den setter
`nosniff`. Workers-versjonen gjør begge deler selv.

**Merk `FORWARDED_ALLOW_IPS`.** uvicorn stoler bare på `X-Forwarded-For`
fra 127.0.0.1 som standard. Kjører API-et i en container, kommer
forbindelsen fra docker-broen i stedet, headeren forkastes, og alle
innringere ser ut som proxyen. Da rammer rate-grensen på innlogging alle
sammen etter ti koder i timen. Workers-versjonen leser `CF-Connecting-IP`,
som kanten setter og klienten ikke kan forfalske, og har derfor ikke
fella.

### Steg, uansett vei

1. **Database.** Workers: `deploy.sh` oppretter D1. Egen server: Neon
   eller Supabase, og appen skal koble til som en rolle som verken er
   superbruker eller har `BYPASSRLS` — begge omgår rad-nivå sikkerheten,
   som er hele isolasjonen mellom kunder.
2. **E-post.** Resend-nøkkel, og SPF, DKIM og DMARC på avsenderdomenet.
   Dette er den eneste avhengigheten som ikke kan testes lokalt, og havner
   koden i søppelpost kan ingen logge inn i det hele tatt.
3. **Rull ut.** Workers: `./deploy.sh`. Egen server: `Dockerfile` og
   `deploy/nginx.conf`.
4. **Sjekk.** `python scripts/smoke_test.py https://…` — den finner de
   feilene som ser helt friske ut utenfra. Trygg mot produksjon: den
   sender ingen e-post og bruker ikke opp rate-grensen.
5. **Logg inn.** Første innlogging oppretter kontoen og organisasjonen
   din.
6. **Importer.** `POST /api/export` med en JSON-fil fra
   `GET /api/export/{id}`. Ta en **fersk** eksport fra en eventuell gammel
   installasjon: formatet før versjon 2 manglet hele skapoversikten.

### Filer

På Workers er R2 en binding, og det finnes ingen annen vei. På
Python-siden går filene til R2 når `R2_BUCKET` er satt, ellers til lokal
disk. Lokal disk er greit for en enkelt maskin, men binder deg til
den: på en plattform som kan flytte instansen — Containers, Fly, Railway —
overlever radene i databasen mens filene forsvinner.

Nøklene er prefikset med organisasjon (`org-3/…`), så en listing av bøtta er
delt per kunde. Filene serveres gjennom API-et, ikke via signerte lenker, så
tilgangssjekken kjører på hver lesning; dette er bilder fra innsiden av
kunders boliger, og en lenke som virker for hvem som helst er feil standard.

### Kjent gjenstående

**Sletting av en fil tar databaseraden først og objektet etterpå.** Feiler
det andre steget ligger objektet igjen i R2 uten at noe kan nå det — og i
motsetning til en strøfil på lokal disk er uteglemt lagring en post på
fakturaen til evig tid. Det logges, men riktig løsning er en
lifecycle-regel på bøtta.

**På Python-siden:** `organization`, `app_user` og `membership` har ikke
rad-nivå sikkerhet.
Autentisering må lese dem før det finnes en innlogget bruker, så en regel som
nøkler på brukeren ville låst seg selv ute. De er i dag beskyttet av at ingen
endepunkter eksponerer dem. Riktig løsning er en egen databaserolle for
autentiseringsoppslaget.

## Konvensjoner

| Lag | Språk |
|-----|-------|
| UI | Norsk |
| Kode, modeller, API | Engelsk |
| Kommentarer | Engelsk i Python- og TypeScript-koden, norsk i konfigurasjon, skript og testmeldinger |
| Git commits | Engelsk |

Kommentarer forklarer *hvorfor*, ikke *hva*. Flere av dem navngir en feil
som faktisk har skjedd her, fordi det er den eneste måten å hindre at noen
rydder bort vernet mot den.

## Repo

- GitHub: https://github.com/jonaskul/tavla
- `main` → produksjon
- `feature/saas-tenancy` → aktiv utvikling: flerkunde, innlogging og
  Workers-omskrivingen

## Arv

`install.sh` og `update.sh` setter opp og oppdaterer en Debian-LXC på
Proxmox. De hører til den opprinnelige enkeltmaskin-installasjonen og
brukes ikke av Workers-utrullingen. De ligger igjen fordi den
installasjonen fortsatt kjører.
