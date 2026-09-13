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
