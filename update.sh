#!/usr/bin/env bash
# Kjøres inne i Tavla-containeren: bash /opt/tavla/update.sh
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}==> $*${NC}"; }
ok()   { echo -e "${GREEN}    OK: $*${NC}"; }
die()  { echo -e "${RED}FEIL: $*${NC}" >&2; exit 1; }

[[ -d /opt/tavla/.git ]] || die "Finner ikke /opt/tavla/.git. Er dette riktig container?"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           Tavla — Oppdatering                        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

info "Henter siste endringer fra GitHub..."
cd /opt/tavla
git pull --ff-only || die "git pull feilet. Løs eventuelle konflikter manuelt."
ok "Kode oppdatert."

info "Installerer Python-avhengigheter..."
/opt/tavla/venv/bin/pip install --quiet --upgrade pip
/opt/tavla/venv/bin/pip install --quiet -r requirements.txt
ok "Python-pakker oppdatert."

info "Kjører databasemigrasjoner..."
if [[ -f alembic.ini ]]; then
    /opt/tavla/venv/bin/alembic upgrade head
    ok "Databasemigrasjoner kjørt."
else
    echo "    (ingen alembic.ini — hopper over migrasjoner)"
fi

info "Bygger frontend..."
cd /opt/tavla/frontend
npm install --silent
npm run build --silent
ok "Frontend bygget."

info "Starter tjenester på nytt..."
systemctl restart tavla
systemctl reload nginx
ok "Tjenester restartet."

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Oppdatering fullført!                   ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
