# Omskriving til Cloudflare Workers

Plan for å flytte backenden fra FastAPI/PostgreSQL til Workers, D1 og R2.
Frontenden (6 164 linjer) står urørt.

## Omfang, målt

| | |
|---|---|
| Backend som skrives om | 3 974 linjer |
| Tester som skrives om | 2 902 linjer, 202 testfunksjoner |
| Endepunkter | 73, hvorav 68 skal portes |
| `routers/system.py` | 176 linjer, slettes — git og systemctl er meningsløst på Workers |

## Hva som er verifisert på forhånd

Ikke antatt, men kjørt mot lokal D1 under `wrangler dev --local`:

- `batch()` **er atomisk** — en batch som feiler etterlater null rader
- **Interaktive transaksjoner er nektet.** `BEGIN` avvises eksplisitt
- `RETURNING` **virker** — genererte id-er kan leses tilbake

Det siste er avgjørende for importen, som i dag oppretter kurser, leser
tilbake id-ene og remapper referanser. Den må struktureres om, men
«alt eller ingenting» kan bevares.

## Det styrende prinsippet

**API-kontrakten endres ikke.**

Samme stier, samme statuskoder, samme JSON. Da trenger frontenden ingen
endringer, de 71 frontend-testene er fortsatt gyldige, og de
nettleserverifiserte flytene fra forrige økt gjelder fremdeles.

Det gjør også at «ferdig» kan defineres presist i stedet for å være en
følelse.

---

## Økt 1 — Kontraktsuite mot dagens backend

Ingen TypeScript. Ingen omskriving.

En testsuite som snakker HTTP mot en kjørende Tavla og ikke vet noe om
Python. Den kjøres mot dagens FastAPI til den er grønn.

Hvorfor først: den største risikoen ved en omskriving er at koden og
testene skrives ut fra samme misforståelse, så ingen av dem fanger feilen.
Skrives testene mot en implementasjon som beviselig virker, koder de
faktisk oppførsel.

Den blir også definisjonen av ferdig. Omskrivingen er i mål når denne
suiten er grønn mot Workers-versjonen — ikke når koden «ser riktig ut».

**Ferdig når:** suiten dekker alle 68 endepunkter og er grønn mot dagens
backend.

---

## Økt 2 — Beslutninger og fundament

Fire valg som er dyre å snu, og som må tas før noe skrives:

**Primærnøkler.** Autoincrement som i dag, eller UUID? Med UUID kjenner du
alle id-er før en batch, og importen kan gjøres som én atomisk operasjon
uten å lese noe tilbake. Med autoincrement må den fases med `RETURNING`.

**Hvor rate-grensen bor.** D1 som i dag, eller en Durable Object. D1 er
enklest og speiler nåværende oppførsel.

**Hvor sesjoner bor.** D1-rader som i dag, eller KV. D1 beholder umiddelbar
tilbakekalling, som var hele grunnen til å velge serversidesesjoner.

**Hvor mye Drizzle.** Full ORM, eller tynt lag over `prepare()`.

Så: wrangler-prosjekt, D1- og R2-bindinger, Drizzle-skjema portet fra
`models.py`, migrasjoner.

**Ferdig når:** skjemaet bygges mot lokal D1 og en smoke-worker leser og
skriver i hver tabell.

---

## Økt 3 — Tenancy

Den viktigste økten, og den som må komme før endepunktene, fordi alt etter
henger på formen den får.

I dag gjør en flush-lytter at `organization_id` **ikke kan** glemmes, og
RLS i PostgreSQL fanger det om den likevel skulle bli det. D1 har ingen
RLS. Da er applikasjonslaget eneste beskyttelse, og det må bygges slik at
en uavgrenset spørring er umulig å skrive — ikke bare noe man skal huske.

Denne kodebasen har allerede vist to ganger hva «husk det» er verdt:
`delete_panel` voktet kurser og glemte moduler, `delete_circuit` voktet
koblingspunkter og glemte utstyr.

**Ferdig når:** tester viser at en spørring uten organisasjon ikke lar seg
uttrykke, og at to organisasjoner ikke ser hverandre.

---

## Økt 4 — Autentisering

Engangskoder, sesjoner, rate-grense. HMAC over WebCrypto i stedet for
Pythons `hmac`. Resend via `fetch()` i stedet for httpx.

Alle egenskapene fra `tests/test_login.py` skal overleve: likt svar for
kjent og ukjent adresse, tak på gjetting, engangsbruk, umiddelbar
utlogging, og at en databasedump ikke gir brukbare koder.

**Ferdig når:** hele innloggingsflyten kjører mot lokal wrangler, og
kontraktsuitens auth-del er grønn.

---

## Økt 5 — Kjernen: anlegg, skap, moduler, kurser

Omtrent 28 endepunkter. Den delen frontenden bruker mest, og der
skapoversikten henter data.

**Ferdig når:** kontraktsuitens del for disse er grønn.

---

## Økt 6 — Resten: koblingspunkter, utstyr, kanaler, endringslogg, modultyper

Omtrent 28 endepunkter. Inkluderer copy-on-write for innebygde modultyper,
som har sin egen finurlighet.

**Ferdig når:** kontraktsuitens del for disse er grønn.

---

## Økt 7 — Filer og import/eksport

R2 som binding i stedet for S3-klient — enklere enn i dag.

Importen er den kjente designoppgaven: den leser tilbake genererte id-er
midt i arbeidet, og D1 tillater ikke det inne i en transaksjon. Løses med
`RETURNING` i faser, eller faller bort helt hvis økt 2 landet på UUID.

Rundturstesten — eksporter, importer, eksporter igjen, krev likhet — er
fasiten.

**Ferdig når:** rundturen er grønn og filer lastes opp og hentes fra R2.

---

## Økt 8 — Utrulling og verifisering

Pages for frontend, Worker for API, begge under `tavla.digibygg.io`.
`scripts/smoke_test.py` kjøres mot den utrullede instansen. Innlogging
gjennom en ekte nettleser med Playwright, som forrige gang.

**Ferdig når:** smoke-testen er grønn og en faktisk innlogging virker i
Chromium mot produksjon.

---

## Hva du gir fra deg

**Row-level security.** Databasehåndhevet isolasjon byttes mot
applikasjonshåndhevet. Økt 3 gjør den så vanskelig å omgå som mulig, men
det er en erstatning, ikke det samme.

**Interaktive transaksjoner.** `batch()` dekker det meste, men mønsteret
«les, bestem, skriv atomisk» finnes ikke.

**Den eksisterende testsuiten som sikkerhetsnett.** 212 tester slutter å
gjelde idet koden de tester er borte. Økt 1 finnes nettopp for å ha noe
annet på plass før det skjer.

## Til sammenligning

Cloudflare Containers: $5, null omskriving, alt beholdt. Åtte økter er
prisen for at PostgreSQL ligger hos Neon i stedet for i samme faktura.

Det er en legitim avveining — men den bør tas med åpne øyne.
