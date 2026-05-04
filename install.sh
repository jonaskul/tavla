#!/usr/bin/env bash
set -euo pipefail

# ─── Farger og hjelpefunksjoner ───────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}==> $*${NC}"; }
ok()    { echo -e "${GREEN}    OK: $*${NC}"; }
warn()  { echo -e "${YELLOW}    ADVARSEL: $*${NC}"; }
die()   { echo -e "${RED}FEIL: $*${NC}" >&2; exit 1; }

# ─── Bekreft at vi kjører på Proxmox-verten ───────────────────────────────────
command -v pct  >/dev/null 2>&1 || die "Finner ikke 'pct'. Dette skriptet må kjøres på Proxmox-verten, ikke inne i en container."
command -v pveam >/dev/null 2>&1 || die "Finner ikke 'pveam'. Kjør skriptet som root på Proxmox-verten."

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           Tavla — Proxmox LXC Installer              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
#  STEG 1: Spør brukeren om alt som trengs FØR noe arbeid starter
# ══════════════════════════════════════════════════════════════════════════════

# ─── Velg branch ──────────────────────────────────────────────────────────────
REPO_URL="https://github.com/jonaskul/tavla.git"
info "Henter tilgjengelige branches fra GitHub..."

mapfile -t BRANCHES < <(
    git ls-remote --heads "$REPO_URL" 2>/dev/null \
        | awk '{print $2}' \
        | sed 's|refs/heads/||' \
        | sort \
    || true
)

SELECTED_BRANCH=""
if [[ ${#BRANCHES[@]} -eq 0 ]]; then
    warn "Kunne ikke hente branches fra GitHub."
    read -rp "Skriv inn branch-navn manuelt: " SELECTED_BRANCH
    [[ -n "$SELECTED_BRANCH" ]] || die "Branch-navn kan ikke være tomt."
else
    echo ""
    echo "Tilgjengelige branches:"
    for i in "${!BRANCHES[@]}"; do
        printf "  %2d) %s\n" "$((i+1))" "${BRANCHES[$i]}"
    done
    echo ""
    while true; do
        read -rp "Velg branch [1-${#BRANCHES[@]}]: " BRANCH_NUM
        if [[ "$BRANCH_NUM" =~ ^[0-9]+$ ]] && \
           [[ "$BRANCH_NUM" -ge 1 ]] && \
           [[ "$BRANCH_NUM" -le ${#BRANCHES[@]} ]]; then
            SELECTED_BRANCH="${BRANCHES[$((BRANCH_NUM-1))]}"
            break
        fi
        echo "  Ugyldig valg. Prøv igjen."
    done
fi

# ─── Hostname ─────────────────────────────────────────────────────────────────
echo ""
read -rp "Hostname for containeren [tavla]: " CT_HOSTNAME
CT_HOSTNAME="${CT_HOSTNAME:-tavla}"

# ─── Nettverksbridge ──────────────────────────────────────────────────────────
read -rp "Nettverksbridge [vmbr0]: " CT_BRIDGE
CT_BRIDGE="${CT_BRIDGE:-vmbr0}"

# ─── Oppsummering og bekreftelse ──────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────"
echo "  Branch:   $SELECTED_BRANCH"
echo "  Hostname: $CT_HOSTNAME"
echo "  Bridge:   $CT_BRIDGE"
echo "  IP:       DHCP (automatisk)"
echo "─────────────────────────────────────────"
echo ""
read -rp "Fortsett med installasjonen? [J/n]: " CONFIRM
case "${CONFIRM,,}" in
    n|nei) echo "Avbrutt."; exit 0 ;;
esac

# ══════════════════════════════════════════════════════════════════════════════
#  STEG 2: Finn og last ned Debian 13-mal
# ══════════════════════════════════════════════════════════════════════════════
info "Sjekker Debian 13 LXC-mal..."

TEMPLATE_STORAGE="local"
TEMPLATE_NAME=""

# Finn eksisterende mal
TEMPLATE_NAME=$(pveam list "$TEMPLATE_STORAGE" 2>/dev/null \
    | awk '{print $1}' \
    | grep -E 'debian-13' \
    | sort -V \
    | tail -1 \
    || true)

if [[ -z "$TEMPLATE_NAME" ]]; then
    info "Laster ned Debian 13-mal (dette kan ta noen minutter)..."
    pveam update >/dev/null 2>&1 || warn "pveam update feilet, fortsetter likevel..."
    AVAIL=$(pveam available --section system 2>/dev/null \
        | awk '{print $2}' \
        | grep -E '^debian-13' \
        | sort -V \
        | tail -1 \
        || true)
    [[ -n "$AVAIL" ]] || die "Finner ingen Debian 13-mal tilgjengelig via pveam. Kjør 'pveam update' manuelt."
    pveam download "$TEMPLATE_STORAGE" "$AVAIL" || die "Nedlasting av mal feilet."
    TEMPLATE_NAME="${TEMPLATE_STORAGE}:vztmpl/${AVAIL}"
else
    # Normaliser til Proxmox storage-format
    if [[ "$TEMPLATE_NAME" != *:* ]]; then
        TEMPLATE_NAME="${TEMPLATE_STORAGE}:vztmpl/$(basename "$TEMPLATE_NAME")"
    fi
fi
ok "Mal: $TEMPLATE_NAME"

# ══════════════════════════════════════════════════════════════════════════════
#  STEG 3: Auto-detekter neste ledige CTID
# ══════════════════════════════════════════════════════════════════════════════
info "Finner neste ledige Container-ID..."
LAST_CTID=$(pct list 2>/dev/null | awk 'NR>1 {print $1}' | sort -n | tail -1 || echo "")
if [[ -z "$LAST_CTID" ]]; then
    CTID=100
else
    CTID=$((LAST_CTID + 1))
fi
ok "Container-ID: $CTID"

# ══════════════════════════════════════════════════════════════════════════════
#  STEG 4: Opprett og start containeren
# ══════════════════════════════════════════════════════════════════════════════
info "Oppretter LXC-container $CTID ($CT_HOSTNAME)..."

pct create "$CTID" "$TEMPLATE_NAME" \
    --hostname "$CT_HOSTNAME" \
    --memory 512 \
    --swap 512 \
    --cores 1 \
    --rootfs local-lvm:4 \
    --net0 name=eth0,bridge="$CT_BRIDGE",ip=dhcp \
    --ostype debian \
    --unprivileged 1 \
    --features nesting=1 \
    --start 0 \
    || die "Klarte ikke opprette container."

ok "Container opprettet."

info "Starter container $CTID..."
pct start "$CTID" || die "Klarte ikke starte container $CTID."
ok "Container startet."

# ══════════════════════════════════════════════════════════════════════════════
#  STEG 5: Vent på DHCP-IP (timeout 60s)
# ══════════════════════════════════════════════════════════════════════════════
info "Venter på DHCP-IP (maks 60 sekunder)..."
CT_IP=""
for i in $(seq 1 30); do
    sleep 2
    CT_IP=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}' || true)
    if [[ -n "$CT_IP" ]]; then
        break
    fi
    printf "."
done
echo ""
[[ -n "$CT_IP" ]] || die "Fikk ikke DHCP-adresse etter 60 sekunder. Sjekk nettverksinnstillingene."
ok "IP-adresse: $CT_IP"

# ══════════════════════════════════════════════════════════════════════════════
#  STEG 6: Skriv og kjør oppsettskript inne i containeren
# ══════════════════════════════════════════════════════════════════════════════
info "Installerer Tavla inne i containeren..."

INNER_SCRIPT=$(cat <<INNER_EOF
#!/usr/bin/env bash
set -euo pipefail

BRANCH="${SELECTED_BRANCH}"
REPO_URL="${REPO_URL}"

echo "==> Oppdaterer pakkelister..."
apt-get update -qq

echo "==> Installerer avhengigheter..."
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    python3 python3-venv python3-pip \
    nodejs npm \
    nginx git curl \
    >/dev/null 2>&1

echo "==> Kloner repo (branch: \$BRANCH)..."
rm -rf /opt/tavla
git clone --branch "\$BRANCH" --depth 1 "\$REPO_URL" /opt/tavla

echo "==> Setter opp Python-miljø..."
python3 -m venv /opt/tavla/venv
/opt/tavla/venv/bin/pip install --quiet --upgrade pip
/opt/tavla/venv/bin/pip install --quiet -r /opt/tavla/requirements.txt

echo "==> Oppretter kataloger og konfigurasjonsfiler..."
mkdir -p /opt/tavla/uploads
chown www-data:www-data /opt/tavla/uploads 2>/dev/null || true

cat > /opt/tavla/backend/.env <<ENVEOF 2>/dev/null || \
cat > /opt/tavla/.env <<ENVEOF2
# Cloudflare R2 (fyll inn for fillagring)
R2_ENDPOINT_URL=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
ENVEOF2
ENVEOF

echo "==> Bygger frontend..."
cd /opt/tavla/frontend
npm install --silent
npm run build --silent

echo "==> Kjører databasemigrasjoner..."
cd /opt/tavla
if [ -f alembic.ini ]; then
    /opt/tavla/venv/bin/alembic upgrade head
else
    echo "    (ingen alembic.ini funnet — hopper over migrasjoner)"
fi

echo "==> Oppretter systemd-tjeneste for Tavla API..."
cat > /etc/systemd/system/tavla.service <<SVCEOF
[Unit]
Description=Tavla API
After=network.target

[Service]
User=root
WorkingDirectory=/opt/tavla
ExecStart=/opt/tavla/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable tavla
systemctl start tavla

echo "==> Konfigurerer nginx..."
rm -f /etc/nginx/sites-enabled/default
cat > /etc/nginx/sites-available/tavla <<NGXEOF
server {
    listen 80 default_server;
    server_name _;

    root /opt/tavla/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGXEOF

ln -sf /etc/nginx/sites-available/tavla /etc/nginx/sites-enabled/tavla
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "==> Konfigurerer auto-innlogging som root på konsollen..."
mkdir -p /etc/systemd/system/console-getty.service.d
cat > /etc/systemd/system/console-getty.service.d/autologin.conf <<AUTOEOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noclear %I \$TERM
AUTOEOF
systemctl daemon-reload

echo ""
echo "Tavla er installert."
INNER_EOF
)

# Skriv skriptet til containeren via pct push
TMPSCRIPT=$(mktemp /tmp/tavla-setup-XXXXXX.sh)
echo "$INNER_SCRIPT" > "$TMPSCRIPT"
pct push "$CTID" "$TMPSCRIPT" /root/tavla-setup.sh
rm -f "$TMPSCRIPT"

pct exec "$CTID" -- bash /root/tavla-setup.sh \
    || die "Oppsettskriptet inne i containeren feilet. Sjekk loggene med: pct enter $CTID"

pct exec "$CTID" -- rm -f /root/tavla-setup.sh

# ══════════════════════════════════════════════════════════════════════════════
#  STEG 7: Ferdig — skriv ut oppsummering
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Installasjon fullført!                  ║"
echo "╠══════════════════════════════════════════════════════╣"
printf "║  URL:       http://%-33s║\n" "${CT_IP}"
printf "║  CTID:      %-37s║\n" "${CTID}"
printf "║  Branch:    %-37s║\n" "${SELECTED_BRANCH}"
printf "║  Hostname:  %-37s║\n" "${CT_HOSTNAME}"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  For å oppdatere Tavla, kjør inne i containeren:    ║"
echo "║    pct enter ${CTID}                                    ║"
echo "║    bash /opt/tavla/update.sh                         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
