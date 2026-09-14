# Beslutninger for Workers-versjonen

Fire valg som er dyre å snu. Tatt i økt 2, før noe ble skrevet.

## Primærnøkler: heltall, ikke UUID

**Avgjort av kontrakten**, ikke av preferanse. `endpoints.json` og
skjemaene sier `id: int`, kontraktsuiten sjekker det eksplisitt, og
frontenden legger id-er i URL-er (`/anlegg/3`). UUID ville endret
kontrakten, som er det ene vi har lovet ikke å gjøre.

Konsekvensen er at importen ikke kan kjenne alle id-er på forhånd. Siden
D1 nekter interaktive transaksjoner, må den bruke `RETURNING` i faser.
Verifisert at det virker.

## Rate-grense: D1

Ikke Durable Objects. Samme oppførsel som i dag, én binding mindre, og
volumet er lite. Tallene er tre koder per adresse per kvarter og ti per IP
per time — det er ikke et samtidighetsproblem.

## Sesjoner: rader i D1, ikke KV

KV er *eventually consistent*. En tilbakekalt sesjon ville fortsatt virke
en stund, og umiddelbar utlogging var hele grunnen til å velge
serversidesesjoner framfor JWT. Å bytte til KV her ville gitt fra seg det
vi betalte for.

## Drizzle, ikke et tynt lag over `prepare()`

Økt 3 skal bygge et lag der en uavgrenset spørring er *umulig å skrive*.
Det krever noe å pakke inn. Rå SQL-strenger kan ikke innkapsles på den
måten — man kan bare be folk huske filteret, og det er nøyaktig det som
ikke virker.

Dette er også det som veier tyngst mot D1: PostgreSQL nekter selv å
returnere en annen kundes rader. Her er applikasjonslaget alt som står
mellom to kunder.

---

# Økt 4: autentisering

Fire ting som ble bestemt underveis, og som ikke er åpenbare fra koden.

## Ingen tilfeldig sesjonshemmelighet

`config.py` faller tilbake på en tilfeldig nøkkel når `SESSION_SECRET`
mangler. I en prosess som lever lenge betyr det bare at sesjoner dør ved
omstart. I en Worker betyr det noe helt annet: isolater opprettes og
forkastes hele tiden, så en kode utstedt av ett isolat kunne ikke
verifiseres av det neste. Innlogging ville feilet tilsynelatende
tilfeldig, og sett ut som en feil i koden.

`secretFor` nekter derfor å finne på en i produksjon, og bruker en fast,
åpenbart falsk nøkkel ellers.

## IP-en hentes fra `CF-Connecting-IP`, og bare derfra

`X-Forwarded-For` kan settes av den som ringer. På Workers er
`CF-Connecting-IP` satt av kanten og kan ikke forfalskes, så per-IP-taket
er faktisk per IP.

Dette fjerner samtidig fella som står dokumentert i `deploy/nginx.conf`:
uvicorn stolte som standard bare på `127.0.0.1`, så bak en proxy delte
alle kallere én adresse og taket låste ute absolutt alle.

## Ingen databasehåndtak i `routes/auth.ts`

Alt som rører en tabell ligger i `src/auth.ts`, som er den ene modulen
utenom `src/db` som får jobbe uavgrenset — den må, for hvert spørsmål den
stiller kommer *før* en organisasjon er kjent.

Ruterfila kaller de funksjonene og rører ingen tabell selv. Det er derfor
unntakslista i `tests/architecture.test.ts` fortsatt er én fil og ikke to.

## Vakten står foran alt, ikke på hvert endepunkt

Økt 5–7 legger til rundt 56 endepunkter. Ingen av dem kommer til å nevne
innlogging med ett ord. De er beskyttet fordi vakten kjører før ruting.

Python-versjonen kom fram til det samme, dyrt: en per-endepunkt-avhengighet
ble glemt på samtlige sytten opprettelsesendepunkter, og en uinnlogget POST
nådde databasen og svarte 500 i stedet for 401.

`tests/worker/guard.test.ts` tester derfor endepunkter som ikke finnes
ennå. Det er ikke en spøk — det er presis den egenskapen som skal holde når
de kommer.

---

## Om testoppsettet

To prosjekter, med vilje.

`vitest.config.ts` kjører i node mot better-sqlite3. Riktig sted å spørre
hva en spørringsbygger produserer, og hva denne kodebasen håndhever på seg
selv.

`vitest.workers.config.ts` kjører i workerd mot ekte lokal D1. Innlogging
hviler på cookies, WebCrypto, `fetch` og D1s egne særheter — alle fire er
kjøretid, og en node-etterligning av dem ville latt omskrivingen bli grønn
mens utrullingen feilet.

`tsc --noEmit` ble lagt til i samme slengen. Prosjektet hadde ingen
typesjekk i det hele tatt: både wrangler og vitest stripper typer uten å
se på dem, så `strict`-feil var usynlige. Det ville vært et dårlig sted å
stå med 56 endepunkter igjen å skrive.

---

# Økt 5: kjernen

23 endepunkter: anlegg, skap, moduler, kurser. Fire ting er verdt å vite.

## Scoping ble uniform, og det er en faktisk endring

Python-versjonen filtrerte på organisasjon i `routers/properties.py` og
ingen andre steder. `panels.py`, `circuits.py` og `modules.py` nevner ikke
organisasjon med ett ord — de lente seg helt på row-level security i
PostgreSQL.

Det virker i produksjon. Men det betyr at isolasjonen for tre firedeler av
API-et lå i en migrasjon i stedet for i koden, og at de samme tre ruterne
lekker på tvers av kunder om de kjøres mot SQLite.

Her går alt gjennom `Tenant`, så det er ikke noe å huske. `core.test.ts`
logger inn som to ekte kontoer og prøver seg: listing, oppslag, nøstede
ruter, spørrestrengfiltre, skriving og referanser.

## En modul kan ikke lenger peke på en annen kundes kurs

Ingenting sjekket at `circuit_id` fantes, langt mindre at den var din.
Fremmednøkkelen ville tatt en som ikke fantes — som en 500 — og en som
tilhørte noen andre ville blitt lagret uten innsigelse.

Hullet er lite, siden kursen er usynlig når den leses tilbake, men en
referanse på tvers av kunder skal ikke kunne skrives i det hele tatt.
Nå er det 404.

## Sletting skjer i én batch

Å slette et skap sletter modulene i det; å slette en kurs frigjør
modulene og kanalene som pekte på den, og fjerner endringsloggen.

Ikke for hastighet: en kurs som er borte mens et automatsikring fortsatt
peker på den tegner et skap koblet til ingenting, og det er en verre
tilstand enn begge ender av operasjonen. D1 har ingen interaktiv
transaksjon, men `batch()` lander helt eller ikke i det hele tatt.

Det er derfor `Tenant` fikk `atomically` og `op` i denne økten. Uten dem
måtte tenant-filteret skrives for hånd akkurat der — i den ene
konstruksjonen som ikke går gjennom klassen.

## Egen modultype vinner over den innebygde

Python slo opp modultype på nøkkel uten sortering, og ville i praksis
funnet den innebygde selv om organisasjonen hadde sin egen med samme
nøkkel. Det er en latent feil snarere enn et valg, så den er ikke båret
over: her vinner din egen definisjon.

De innebygde typene skrives av migrasjon 0001 i stedet for av en
oppstartsfunksjon. En Worker har ingen oppstart, og en «finnes de
ennå»-sjekk per forespørsel ville blitt en spørring i hver modulvisning.

---

## To ting testoppsettet lærte oss

**Feltvalidering trengte pydantics slappe modus.** Tall kan komme som
strenger, fordi frontenden parser skjemafelt i et dusin ulike filer og ett
av dem kommer til å la være. Å være strengere enn implementasjonen man
erstatter er fortsatt en kontraktsendring.

**Fixturen som ikke sjekket svaret skjulte en ekte feil.** Opprydningen
mellom tester tømte også de innebygde modultypene, så hver modul svarte
422. Det kom ut som «expected 422 to be 404» fra en URL med ordet
`undefined` i seg. Fixturen sjekker statuskoden nå.

---

# Økt 6: resten av treet

Koblingspunkter, utstyr, kanaler, endringslogg og modultyper — 28
endepunkter. Kontraktsuiten er nå grønn på alt unntatt filer og
import/eksport, som er økt 7. Coverage-testen navngir de sju som står
igjen, og alle sju er filendepunkter.

## Copy-on-write er den ene som trengte to kontoer

Åtte innebygde modultyper deles av alle. Å redigere en av dem på stedet
ville endret fargen på *alles* automatsikring, så en redigering lager i
stedet organisasjonens egen versjon: samme nøkkel, skygger for den delte,
og sletter man kopien er man tilbake til standarden.

Kontraktsuiten kjører som én konto. Den kan vise at det blir en kopi. Den
kan ikke vise det kopien finnes for — at den *andre* kunden fortsatt ser
den opprinnelige. Den testen krever to kontoer, og på D1 finnes det
ingenting annet som håndhever det.

## Skrivinger som må lande hele

Å slette utstyr betyr fire ting: kanalene, loggpostene som peker på det,
raden selv, og en ny loggpost som forteller at det ble slettet. Én batch.

Python-versjonen klarte å glemme én av dem og svare 500 for det helt
alminnelige tilfellet — nøyaktig samme feil som med skap og moduler,
funnet hver for seg, måneder fra hverandre.

## Loggen sorteres på id i tillegg til tidspunkt

`changed_at` har sekundoppløsning, og postene som betyr noe skrives
samtidig: å opprette utstyr logger det og legger til kanalene i én batch.
Sorterte man bare på tidspunkt ble de stående likt, og SQLite brøt
uavgjortheten på rowid — altså eldste først, det stikk motsatte av hva
sorteringen er til for.

Det viste seg som en test som feilet med `[25,26,27,28]` mot
`[28,27,26,25]`. Python-versjonen har samme svakhet; den er ikke båret
over.

## To hull til lukket

En loggpost kunne bære en annen kundes `circuit_id`, og en kanal kunne
peke på en annen kundes kurs. Begge ville ligget i vår konto og beskrevet
deres anlegg. Begge er 404 nå.

## Én asymmetri er *ikke* rettet

`POST /api/connection_points` skriver ingen loggpost;
`POST /api/circuits/{id}/connection_points` gjør det. Det er ikke til å
forsvare, men det er synlig i kontrakten, og denne omskrivingen endrer
ikke kontrakten noe sted. Det står som en kommentar i koden slik at det
leses som et valg og ikke som en forglemmelse.

---

## Hva opprydningen mellom tester lærte oss, igjen

Første forsøk beholdt innebygde modultyper med `where is_builtin = 0`.
Men en kundes copy-on-write-kopi beholder `is_builtin = true` — det er
det som sorterer den sammen med standardtypene — så de radene ble stående
igjen, holdt sin organisasjon i live, og knakk hele opprydningen.

Det som gjør en rad delt er å ikke ha en eier. Betingelsen er
`organization_id` nå.

---

# Økt 7: filer og import/eksport

12 endepunkter. **Kontraktsuiten er grønn: 77 av 77**, medregnet
coverage-testen som beviser at hvert eneste endepunkt faktisk ble truffet.
Det er punktet der omskrivingen er ferdig etter definisjonen fra økt 1 —
ikke når koden ser riktig ut.

## R2 er den ene delen som ble enklere

En binding, ikke en S3-klient. Ingen endepunkt, ingen nøkler, ingen
signering, ingen boto3. `storage.py` finnes i stor grad for å skjule en
S3-klient bak et grensesnitt slik at en lokal utsjekk slipper
legitimasjon — et problem som ikke oppstår her.

Utlevering går fortsatt gjennom applikasjonen, ikke via presignerte URL-er.
En presignert URL virker for den som holder den, og dette er bilder fra
innsiden av kunders hjem. Det ble til og med billigere: `new
Response(object.body)` strømmer, mens Python bufret hele fila.

## Størrelsen avvises før kroppen leses

Python leste hele opplastingen inn i minnet og spurte *så* om den var for
stor. Det er et tjenestenektangrep forkledd som en valideringsfeil. En
Worker har et hardt minnetak per isolat, så `Content-Length` sjekkes
først, og den nøyaktige sjekken kommer etterpå.

## Importen: fem runder, ikke én transaksjon

D1 nekter `BEGIN`. `batch()` er atomisk og gir tilbake id-ene hver setning
genererte — begge deler verifisert mot ekte lokal D1, ikke antatt.

    1. anlegget
    2. hvert skap
    3. hver kurs          <- før noe som helst refererer til én
    4. moduler, koblingspunkter, utstyr
    5. kanaler            <- trenger utstyrs-id-ene fra runde 4

Runde 3 er grunnen til formen: en kanal kan betjene en kurs under et annet
skap, så alle kurser må finnes før noe peker på én.

**Rundene er ikke atomiske med hverandre, og det kan ikke gjenopprettes på
D1.** To ting kommer nær:

- Alt som kan avvises, avvises før runde 1.
- Feiler en senere runde, slettes anlegget og alt under det. Opprydningen
  er selv én batch.

Dette er regningen for heltalls-primærnøkler fra økt 2. UUID-er ville
gjort hele importen til én atomisk batch. Heltall var riktig valg —
kontrakten sier `id: int` og frontenden legger dem i URL-er — men det er
her det betales.

## To feil som testene fant, ikke jeg

**Valideringen strippet de nestede listene.** `check` beholder bare
feltene formen navngir, men nestingen ligger i nøkler ingen form navngir.
Importen opprettet altså anlegget og skapene og stoppet — stille.
Rundturstesten var det eneste som sa fra.

**Valideringen sjekket bare at feltene fantes, ikke hva de var.** En modul
med `"row": "øverst"` slapp gjennom og ble en databasefeil midt i en faset
import. Hele argumentet om at «alt avvises før runde 1» hvilte på en sjekk
som ikke gjorde det. Nå brukes samme feltvalidator som resten av API-et.

## Målt, ikke antatt

En lokal D1-batch tok **10 000 setninger** uten å klage. Grensen er altså
ikke praktisk for importer av realistisk størrelse. Men dette er
miniflare — grensene på ekte D1 kan være strammere, og en import av et
stort bygg er verdt å prøve mot produksjon i økt 8 før det kalles trygt.

## Én ting som koster penger å glemme

Slettingen tar raden først, så objektet. Feiler det andre steget, ligger
objektet igjen i R2 uten at noen kan nå det — og til forskjell fra en
strøfil på lokal disk er det en post på fakturaen til evig tid. Det logges,
men den riktige løsningen er en lifecycle-regel på bøtta. Det hører til
økt 8.

---

## Om testklienten

Den satte `content-type: application/json` på alt som hadde en kropp, også
`FormData` — som bærer sin egen multipart-type med grensestrengen i seg.
Hver opplasting kom fram som en uleselig klump, og det viste seg som en
422 om et manglende filfelt, flere lag fra årsaken.

Kontraktsuiten var upåvirket, siden httpx gjør dette riktig. Det er verdt
å merke seg: den eneste grunnen til at dette ble oppdaget som en feil i
testklienten og ikke i koden, var at kontrakten allerede var grønn.

---

# Utrulling: én worker, ikke to tjenester

Frontenden serveres av den samme workeren, via `[assets]` i
`wrangler.toml`. Alternativet var et eget Pages-prosjekt og ruting mellom
to tjenester under ett domene.

Tre grunner, hvorav den siste er den viktige:

- Én konfigblokk i stedet for to utrullinger som må holdes i takt.
- `not_found_handling = "single-page-application"` løser dyplenkene.
  Uten den virker navigasjon inne i appen, men en oppdatering av
  `/anlegg/1` gir 404 — som aldri er siden man tester for hånd.
- **Same-origin er det som lar sesjonscookien bli stående på
  `SameSite=Lax`.** En frontend på ett domene og et API på et annet ville
  krevd `SameSite=None`, altså nøyaktig den CSRF-beskyttelsen vi ikke vil
  gi fra oss.

`run_worker_first = ["/api/*"]` er nødvendig: uten den ville `/api/...`
også endt som `index.html`.

## Det kostet en header, og smoke-testen sa fra

Statiske filer serveres av Cloudflare før koden kjører — det er hele
poenget — så middleware i `src/app.ts` når dem aldri. `nosniff` forsvant i
samme øyeblikk frontenden ble servert som filer i stedet for gjennom
applikasjonen.

Den settes nå i `frontend/public/_headers`, sammen med `X-Frame-Options`
og `Referrer-Policy` — de tre nginx satte.

## Nettleseren fant noe ingen test gjorde

En ekte innlogging i Chromium mot Workers-bygget viste tre 404-er i
konsollen: frontenden pollet fortsatt `/api/system/pending`.

De endepunktene skallet ut til `git` og `systemctl`, og planen slettet
dem i økt 1 — utrulling er `wrangler deploy` nå, ikke en knapp i appen.
Men frontenden visste det ikke, og ville logget 404-er for alltid med en
innstillingsfane som ikke kunne virke.

Fjernet: `SystemAdmin.jsx`, fanen, ruten, de tre API-kallene,
oppdateringsprikken i navigasjonen og tekstene. Det er det eneste stedet
frontenden er rørt i hele omskrivingen, og det er fordi endepunktene den
snakket med ikke finnes lenger.

Verdt å merke seg hvordan det ble funnet. 111 Workers-tester, 77
kontraktstester og 71 frontend-tester sa alle ingenting: kontrakten
beskriver endepunkter som finnes, og frontend-testene mocker API-et. Det
måtte en nettleser til.
