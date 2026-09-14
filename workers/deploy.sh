#!/usr/bin/env bash
#
# Ett skript som setter opp og ruller ut Tavla på Cloudflare.
#
# Kjøres fra din egen maskin, ikke fra en Claude-økt: den økten har
# hverken Cloudflare-innlogging eller nettverkstilgang til api.cloudflare.com.
#
#     cd workers
#     npx wrangler login        # én gang
#     ./deploy.sh
#
# Trygt å kjøre om igjen. Hvert steg sjekker om det allerede er gjort, så
# et avbrutt forsøk fortsetter der det slapp i stedet for å lage duplikater.
#
# Det skriptet IKKE kan gjøre for deg:
#   - verifisere sendedomenet i Resend (DNS hos den som har digibygg.io)
#   - peke tavla.digibygg.io mot workeren (ett steg i dashbordet)
# Begge står forklart til slutt.

set -euo pipefail

DB_NAME="tavla"
BUCKET="tavla-filer"
WRANGLER="npx --yes wrangler@4"

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
note() { printf '    %s\n' "$1"; }

# --- Hvem er vi ------------------------------------------------------------

say "Sjekker innlogging"
# whoami avslutter med 0 selv når man ikke er innlogget — den rapporterer
# jo vellykket at man ikke er det. Sjekket på teksten i stedet, etter at
# den første versjonen av dette slapp forbi og lot skriptet feile flere
# steg senere med Cloudflares egen feilmelding i stedet for sin egen.
WHOAMI=$($WRANGLER whoami 2>&1 || true)
if printf '%s' "$WHOAMI" | grep -q "not authenticated"; then
  cat >&2 <<'LOGIN'
    Ikke innlogget på Cloudflare.

      npx wrangler login

    Uten nettleser — CI, en container, en agent — lag et API-token med
    disse tre kontorettighetene:

      Workers Scripts    Edit    (deploy, secret put)
      D1                 Edit    (opprette basen, kjøre migrasjoner)
      Workers R2 Storage Edit    (opprette bøtta)

    og sett:

      CLOUDFLARE_API_TOKEN=...
      CLOUDFLARE_ACCOUNT_ID=...   # slipper Account Settings:Read
      WRANGLER_SEND_METRICS=false # slipper sparrow.cloudflare.com

    Da er api.cloudflare.com det eneste verten som må være åpen.
LOGIN
  exit 1
fi
printf '%s\n' "$WHOAMI" | grep -iE "account name|account id" || true

# --- D1 --------------------------------------------------------------------

say "Databasen ($DB_NAME)"
if $WRANGLER d1 info "$DB_NAME" >/dev/null 2>&1; then
  note "finnes allerede"
else
  $WRANGLER d1 create "$DB_NAME"
fi

# database_id hentes ut og skrives inn i wrangler.toml, så du slipper å
# klippe og lime den. Den er ikke hemmelig — den identifiserer bare basen.
DB_ID=$($WRANGLER d1 info "$DB_NAME" --json 2>/dev/null | grep -o '"uuid"[^,]*' | head -1 | sed 's/.*: *"\(.*\)"/\1/')
if [ -z "$DB_ID" ]; then
  echo "Fant ikke database_id. Kjør 'npx wrangler d1 info $DB_NAME' og se etter." >&2
  exit 1
fi
note "database_id: $DB_ID"

if grep -q 'database_id = "local"' wrangler.toml; then
  # BSD og GNU sed er uenige om -i, så gjør det med en midlertidig fil.
  sed "s/database_id = \"local\"/database_id = \"$DB_ID\"/" wrangler.toml > wrangler.toml.tmp
  mv wrangler.toml.tmp wrangler.toml
  note "skrevet inn i wrangler.toml — husk å committe den"
fi

# --- R2 --------------------------------------------------------------------

say "Filbøtta ($BUCKET)"
if $WRANGLER r2 bucket info "$BUCKET" >/dev/null 2>&1; then
  note "finnes allerede"
else
  $WRANGLER r2 bucket create "$BUCKET"
fi

# --- Hemmeligheter ---------------------------------------------------------
#
# SESSION_SECRET nøkler engangskodene. Den MÅ være den samme for hele
# utrullingen: isolater opprettes og forkastes hele tiden, så en tilfeldig
# nøkkel per isolat ville gjort at en kode utstedt av ett ikke kunne
# verifiseres av det neste. Innlogging ville feilet tilsynelatende
# tilfeldig. Derfor nekter config.ts å finne på en i produksjon.

say "Hemmeligheter"
have_secret() { $WRANGLER secret list 2>/dev/null | grep -q "\"$1\""; }

if have_secret SESSION_SECRET; then
  note "SESSION_SECRET er satt"
else
  note "Genererer SESSION_SECRET (64 tilfeldige tegn)"
  openssl rand -base64 48 | tr -d '\n' | $WRANGLER secret put SESSION_SECRET
fi

if have_secret RESEND_API_KEY; then
  note "RESEND_API_KEY er satt"
else
  note "Lim inn API-nøkkelen fra resend.com/api-keys:"
  $WRANGLER secret put RESEND_API_KEY
fi

# --- Produksjonsinnstillinger ----------------------------------------------

say "Produksjonsvariabler"
if grep -q 'TAVLA_ENV = "production"' wrangler.toml; then
  note "TAVLA_ENV = production"
else
  cat >&2 <<'WARN'
    wrangler.toml står ikke på production.

    I utviklingsmodus godtar workeren en manglende SESSION_SECRET i
    stillhet, og da kan en kode utstedt av ett isolat ikke verifiseres av
    det neste. Innlogging ville feilet tilsynelatende tilfeldig.

      [vars]
      TAVLA_ENV = "production"
WARN
  exit 1
fi

if grep -q 'AUTH_FROM_EMAIL' wrangler.toml; then
  note "AUTH_FROM_EMAIL: $(grep AUTH_FROM_EMAIL wrangler.toml | head -1 | cut -d'"' -f2)"
  note "adressen må ligge under et domene som er verifisert i Resend"
else
  echo "    AUTH_FROM_EMAIL mangler — kodene havner i loggen i stedet for i innboksen." >&2
  exit 1
fi

# --- Frontenden ------------------------------------------------------------
#
# Workeren serverer den selv, fra ../frontend/dist. Bygges her så en
# utrulling aldri sender en gammel bunt: det er en feil som ser ut som at
# endringen ikke virket, ikke som at den ikke ble rullet ut.

say "Bygger frontenden"
(cd ../frontend && npm ci --silent && npm run build)

# --- Migrasjoner -----------------------------------------------------------
#
# Før utrulling, ikke etter: en worker som er live mot et skjema som ennå
# ikke finnes svarer 500 på alt.

say "Migrasjoner"
$WRANGLER d1 migrations apply "$DB_NAME" --remote

# --- Utrulling -------------------------------------------------------------

say "Ruller ut"
$WRANGLER deploy

# --- Etterpå ---------------------------------------------------------------

cat <<'DONE'

==> Ferdig med det som kan skriptes.

To ting igjen, begge i et dashbord:

1. DOMENET
   Cloudflare-dashbordet -> Workers & Pages -> tavla -> Settings ->
   Domains & Routes -> Add custom domain -> tavla.digibygg.io

   Cloudflare setter DNS-posten selv når digibygg.io ligger der.

2. RESEND
   resend.com/domains -> Add domain -> tavla.digibygg.io
   Legg inn DKIM-, SPF- og DMARC-postene Resend viser, hos den som har
   digibygg.io. Vent på "Verified".

   Dette er det kritiske steget. Alt annet kan feilsøkes i ettertid; uten
   e-post kommer ingen innloggingskode fram, og da kommer ingen inn.

3. LIFECYCLE PÅ BØTTA (anbefalt, ikke påkrevd)
   R2 -> tavla-filer -> Settings -> Object lifecycle rules
   Slett ufullstendige opplastinger etter 1 dag.

   Sletting av en fil tar databaseraden først og objektet etterpå. Feiler
   det andre steget ligger objektet igjen uten at noe kan nå det — og i R2
   er uteglemt lagring en post på fakturaen til evig tid.

Så, for å se at det faktisk virker:

   npm run smoke -- https://tavla.digibygg.io

DONE
