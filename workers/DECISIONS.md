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
