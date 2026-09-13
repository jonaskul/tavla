# Kontraktsuite

API-kontrakten, kjørt over HTTP mot en kjørende Tavla. Ingenting her
importerer applikasjonen — det er hele poenget. Suiten skal kjøre uendret
mot FastAPI-implementasjonen og mot en Workers-omskriving, og er det som
gir «omskrivingen er ferdig» en presis betydning.

```bash
# start en instans
DATABASE_URL="sqlite:///./contract.db" AUTH_MODE=single_user \
  python -m uvicorn main:app --port 8011

# kjør suiten mot den
TAVLA_BASE_URL=http://127.0.0.1:8011 python -m pytest contract/
```

Er instansen ikke i `single_user`-modus, sett `TAVLA_SESSION` til en gyldig
sesjonscookie.

## Hvorfor den ble skrevet først

Den største risikoen ved en omskriving er at ny kode og nye tester skrives
ut fra samme misforståelse, så ingen av dem fanger feilen. Denne suiten er
skrevet mot en implementasjon som beviselig virker, og koder derfor faktisk
oppførsel.

## Dekning er bevist, ikke påstått

`endpoints.json` er kontrakten, frosset fra OpenAPI-skjemaet.
Klienten registrerer hvilken rutemal hver forespørsel treffer, og
`test_coverage.py` feiler hvis noe i inventaret ikke ble berørt — eller hvis
suiten treffer noe som ikke står der, som betyr at inventaret er utdatert.

De fem `/api/system`-rutene er bevisst utelatt: de kjører git og systemctl,
og slettes på Workers.

Kjør `contract/refresh_inventory.py` bare når et endepunkt med vilje legges
til eller fjernes. Endrer filen seg ved et uhell, flyttes målet i stillhet.

## Krav til suiten

Den kjører mot en **vedvarende** instans, ikke en fersk database per test.
Derfor må alt den oppretter tåle å eksistere fra før — se `unique`-fixturen
— og tester som endrer delt tilstand må rydde opp etter seg. Verifisert ved
å kjøre den to ganger på rad mot samme instans, og mot en fersk.
