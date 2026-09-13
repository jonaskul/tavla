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
