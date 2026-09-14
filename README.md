# Tavla

Dokumentasjonsverktøy for elektriske installasjoner i norske hjem. Laget
for privatpersoner, fagfolk og installatører som vil ha oversikt over
sikringsskap, kurser og tilkoblet utstyr.

Kjører på Cloudflare: én Worker som serverer både appen og API-et, D1 som
database, R2 for filer.

## Kom i gang

Krever **Node 20 eller nyere**. Ingenting annet.

```bash
git clone <repo>
cd tavla/workers
npm install
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply tavla --local

cd ../frontend && npm install && npm run build

cd ../workers && npx wrangler dev --local
```

Appen ligger nå på http://127.0.0.1:8787.

Logg inn med hvilken som helst e-postadresse — første innlogging oppretter
kontoen. Koden sendes ikke lokalt, den skrives til wrangler-loggen i
terminalen:

```
E-post ikke sendt (ingen RESEND_API_KEY). Til deg@example.com: Innloggingskode til Tavla
Koden din er 481519
```

## Test

```bash
cd workers && npm test
```

Kjører typesjekk, 40 tester i Node og 159 i ekte workerd mot en ekte lokal
D1. Frontenden har sine egne: `cd frontend && npm test`.

De to testprosjektene i `workers/` stiller ulike spørsmål, og det er med
vilje. Node mot better-sqlite3 spør hva en spørringsbygger produserer, og
hva kodebasen håndhever på seg selv. workerd mot ekte D1 spør om ting
faktisk virker — cookies, WebCrypto, `fetch`, multipart og D1s egne
særheter er alle kjøretid, og en etterligning i Node ville latt testene bli
grønne mens utrullingen feilet.

`workers/tests/worker/contract.test.ts` er den viktigste. Den går gjennom
hvert eneste av de 69 endepunktene over HTTP, og en egen test feiler hvis
ett av dem ikke faktisk ble truffet. Uten den er «testene dekker API-et» en
påstand.

## Rull ut

```bash
cd workers
npx wrangler login
./deploy.sh
```

Skriptet oppretter D1-basen og R2-bøtta, skriver `database_id` inn i
`wrangler.toml`, genererer `SESSION_SECRET`, ber om Resend-nøkkelen, bygger
frontenden, kjører migrasjonene og ruller ut. Trygt å kjøre om igjen — hvert
steg sjekker om det allerede er gjort.

Etterpå:

```bash
npm run smoke -- https://tavla.digibygg.io
```

Den finner feilene som ser helt friske ut utenfra: en cookie uten `Secure`,
en app som svarer uinnlogget, en manglende SPA-fallback. Trygg mot
produksjon — den sender ingen e-post og bruker ikke opp innloggingens
rate-grense.

To ting skriptet ikke kan gjøre, begge i et dashbord:

1. **Domenet.** Workers & Pages → tavla → Settings → Domains & Routes →
   Add custom domain.
2. **Resend.** resend.com/domains → legg til sendedomenet og legg inn
   DKIM-, SPF- og DMARC-postene det viser.

**Nummer to er det kritiske.** Alt annet kan feilsøkes i ettertid. Havner
innloggingskoden i søppelposten, kommer ingen inn — og ingenting noe sted
ser ut som en feil.

## Slik henger det sammen

```
frontend/          React + Vite + Tailwind. Snakker med /api.
workers/
  src/
    app.ts         Vakten, så rutene. Kjører før ruting, så et nytt
                   endepunkt er beskyttet fordi det finnes.
    auth.ts        Hvem som ringer. Den ene modulen utenom src/db som
                   får jobbe uten tenant-filter — alt den spør om
                   skjer før en organisasjon er kjent.
    db/tenant.ts   Grensen mellom kunder.
    routes/        Endepunktene. Får aldri et databasehåndtak.
    schema.ts      Tabellene.
  migrations/      Kjøres av wrangler mot D1.
  tests/           Node-prosjektet.
  tests/worker/    workerd-prosjektet.
```

### Det som er verdt å vite før du endrer noe

**D1 har ingen row-level security.** PostgreSQL nektet å returnere en annen
kundes rader selv til en spørring som glemte filteret sitt. Her er
`src/db/tenant.ts` det eneste som står mellom to kunder.

Derfor får rutehåndterere aldri et databasehåndtak — de får et
`Tenant`-objekt, der hver metode scoper og ingen metode tar «alle rader»
som argument. En uavgrenset spørring har ingen steder å skrives.

`tests/architecture.test.ts` håndhever det mekanisk: den feiler hvis en fil
utenfor en kort, navngitt liste henter et uavgrenset håndtak. Lista er kort
med vilje, så en fjerde fil må begrunnes i en diff framfor å snike seg inn.

Grunnen til at det er bygget sånn står i koden: «husk å legge til filteret»
har allerede sviktet to ganger i denne kodebasen, på et mye enklere
problem. Som 500-feil var det irriterende. Anvendt på kundeskille er det én
kunde som leser en annens dokumentasjon.

**D1 nekter interaktive transaksjoner.** `BEGIN` avvises. `batch()` er
atomisk og gir tilbake id-ene den genererte, så flere skrivinger som må
lande sammen går gjennom `tenant.atomically()`. Importen er det ene stedet
dette ikke strekker til — den kjører i fem runder, og
`workers/DECISIONS.md` forklarer hva som gis fra seg der.

**`workers/DECISIONS.md`** er loggen over hvorfor ting ser ut som de gjør,
økt for økt, inkludert det som ble valgt bort. Les den før du snur på noe
som virker rart.

## Konvensjoner

| Lag | Språk |
|-----|-------|
| UI | Norsk |
| Kode, modeller, API | Engelsk |
| Kommentarer | Engelsk i `src/`, norsk i konfigurasjon, skript og testmeldinger |
| Git commits | Engelsk |

Kommentarer forklarer *hvorfor*, ikke *hva*. Flere av dem navngir en feil
som faktisk har skjedd her, fordi det er den eneste måten å hindre at noen
rydder bort vernet mot den.

## Kjent gjenstående

**Sletting av en fil tar databaseraden først og objektet etterpå.** Feiler
det andre steget, ligger objektet igjen i R2 uten at noe kan nå det — og
uteglemt lagring er en post på fakturaen til evig tid. Det logges, men
riktig løsning er en lifecycle-regel på bøtta.

**Importen er ikke én transaksjon.** Fem runder, hver atomisk for seg. Alt
som kan avvises avvises før den første, og feiler en senere runde slettes
anlegget og alt under det — men det er en kompenserende sletting, ikke en
rollback.
