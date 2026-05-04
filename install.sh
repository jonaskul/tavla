#!/usr/bin/env bash
set -euo pipefail

# ─── Colors and helpers ───────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}==> $*${NC}"; }
ok()    { echo -e "${GREEN}    OK: $*${NC}"; }
warn()  { echo -e "${YELLOW}    WARNING: $*${NC}"; }
die()   { echo -e "${RED}ERROR: $*${NC}" >&2; exit 1; }

# ─── Verify we are running on the Proxmox host ────────────────────────────────
command -v pct   >/dev/null 2>&1 || die "'pct' not found. This script must be run on the Proxmox host, not inside a container."
command -v pveam >/dev/null 2>&1 || die "'pveam' not found. Run this script as root on the Proxmox host."

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           Tavla — Proxmox LXC Installer              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 1: Gather all user input BEFORE doing any work
# ══════════════════════════════════════════════════════════════════════════════

# ─── Select branch ────────────────────────────────────────────────────────────
REPO_URL="https://github.com/jonaskul/tavla.git"
GITHUB_API="https://api.github.com/repos/jonaskul/tavla/branches?per_page=100"
info "Fetching available branches from GitHub..."

mapfile -t BRANCHES < <(
    curl -sf --max-time 10 "$GITHUB_API" 2>/dev/null \
        | grep -o '"name":"[^"]*"' \
        | sed 's/"name":"//;s/"//' \
        | sort \
    || true
)

SELECTED_BRANCH=""
if [[ ${#BRANCHES[@]} -eq 0 ]]; then
    warn "Could not fetch branches from GitHub."
    read -rp "Enter branch name manually: " SELECTED_BRANCH
    [[ -n "$SELECTED_BRANCH" ]] || die "Branch name cannot be empty."
else
    echo ""
    echo "Available branches:"
    for i in "${!BRANCHES[@]}"; do
        printf "  %2d) %s\n" "$((i+1))" "${BRANCHES[$i]}"
    done
    echo ""
    while true; do
        read -rp "Select branch [1-${#BRANCHES[@]}]: " BRANCH_NUM
        if [[ "$BRANCH_NUM" =~ ^[0-9]+$ ]] && \
           [[ "$BRANCH_NUM" -ge 1 ]] && \
           [[ "$BRANCH_NUM" -le ${#BRANCHES[@]} ]]; then
            SELECTED_BRANCH="${BRANCHES[$((BRANCH_NUM-1))]}"
            break
        fi
        echo "  Invalid choice. Try again."
    done
fi

# ─── Hostname ─────────────────────────────────────────────────────────────────
echo ""
read -rp "Container hostname [tavla]: " CT_HOSTNAME
CT_HOSTNAME="${CT_HOSTNAME:-tavla}"

# ─── Network bridge ───────────────────────────────────────────────────────────
read -rp "Network bridge [vmbr0]: " CT_BRIDGE
CT_BRIDGE="${CT_BRIDGE:-vmbr0}"

# ─── Summary and confirmation ─────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────"
echo "  Branch:   $SELECTED_BRANCH"
echo "  Hostname: $CT_HOSTNAME"
echo "  Bridge:   $CT_BRIDGE"
echo "  IP:       DHCP (automatic)"
echo "─────────────────────────────────────────"
echo ""
read -rp "Proceed with installation? [y/N]: " CONFIRM
case "${CONFIRM,,}" in
    y|yes) ;;
    *) echo "Aborted."; exit 0 ;;
esac

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 2: Find or download the Debian 13 template
# ══════════════════════════════════════════════════════════════════════════════
info "Checking for Debian 13 LXC template..."

TEMPLATE_STORAGE="local"
TEMPLATE_NAME=""

# Look for an existing template
TEMPLATE_NAME=$(pveam list "$TEMPLATE_STORAGE" 2>/dev/null \
    | awk '{print $1}' \
    | grep -E 'debian-13' \
    | sort -V \
    | tail -1 \
    || true)

if [[ -z "$TEMPLATE_NAME" ]]; then
    info "Downloading Debian 13 template (this may take a few minutes)..."
    pveam update >/dev/null 2>&1 || warn "pveam update failed, continuing anyway..."
    AVAIL=$(pveam available --section system 2>/dev/null \
        | awk '{print $2}' \
        | grep -E '^debian-13' \
        | sort -V \
        | tail -1 \
        || true)
    [[ -n "$AVAIL" ]] || die "No Debian 13 template available via pveam. Run 'pveam update' manually."
    pveam download "$TEMPLATE_STORAGE" "$AVAIL" || die "Template download failed."
    TEMPLATE_NAME="${TEMPLATE_STORAGE}:vztmpl/${AVAIL}"
else
    # Normalize to Proxmox storage format
    if [[ "$TEMPLATE_NAME" != *:* ]]; then
        TEMPLATE_NAME="${TEMPLATE_STORAGE}:vztmpl/$(basename "$TEMPLATE_NAME")"
    fi
fi
ok "Template: $TEMPLATE_NAME"

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 3: Auto-detect next available CTID
# ══════════════════════════════════════════════════════════════════════════════
info "Finding next available container ID..."
LAST_CTID=$(pct list 2>/dev/null | awk 'NR>1 {print $1}' | sort -n | tail -1 || echo "")
if [[ -z "$LAST_CTID" ]]; then
    CTID=100
else
    CTID=$((LAST_CTID + 1))
fi
ok "Container ID: $CTID"

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 4: Create and start the container
# ══════════════════════════════════════════════════════════════════════════════
info "Creating LXC container $CTID ($CT_HOSTNAME)..."

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
    || die "Failed to create container."

ok "Container created."

info "Starting container $CTID..."
pct start "$CTID" || die "Failed to start container $CTID."
ok "Container started."

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 5: Wait for DHCP IP (timeout 60s)
# ══════════════════════════════════════════════════════════════════════════════
info "Waiting for DHCP address (up to 60 seconds)..."
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
[[ -n "$CT_IP" ]] || die "No DHCP address after 60 seconds. Check your network settings."
ok "IP address: $CT_IP"

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 6: Push and run setup script inside the container
# ══════════════════════════════════════════════════════════════════════════════
info "Installing Tavla inside the container..."

INNER_SCRIPT=$(cat <<INNER_EOF
#!/usr/bin/env bash
set -euo pipefail

BRANCH="${SELECTED_BRANCH}"
REPO_URL="${REPO_URL}"

echo "==> Updating package lists..."
apt-get update -qq

echo "==> Installing dependencies..."
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    python3 python3-venv python3-pip \
    nodejs npm \
    nginx git curl \
    >/dev/null 2>&1

echo "==> Cloning repository (branch: \$BRANCH)..."
rm -rf /opt/tavla
git clone --branch "\$BRANCH" --depth 1 "\$REPO_URL" /opt/tavla

echo "==> Setting up Python virtual environment..."
python3 -m venv /opt/tavla/venv
/opt/tavla/venv/bin/pip install --quiet --upgrade pip
/opt/tavla/venv/bin/pip install --quiet -r /opt/tavla/requirements.txt

echo "==> Creating directories and config files..."
mkdir -p /opt/tavla/uploads /opt/tavla/backend
chown www-data:www-data /opt/tavla/uploads 2>/dev/null || true

cat > /opt/tavla/backend/.env <<ENVEOF
# Cloudflare R2 (fill in for file storage)
R2_ENDPOINT_URL=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
ENVEOF

echo "==> Building frontend..."
cd /opt/tavla/frontend
npm install --silent
npm run build --silent

echo "==> Running database migrations..."
cd /opt/tavla
if [ -f alembic.ini ]; then
    /opt/tavla/venv/bin/alembic upgrade head
else
    echo "    (no alembic.ini found — skipping migrations)"
fi

echo "==> Creating systemd service for Tavla API..."
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

echo "==> Configuring nginx..."
rm -f /etc/nginx/sites-enabled/default
cat > /etc/nginx/sites-available/tavla <<NGXEOF
server {
    listen 80 default_server;
    server_name _;

    root /opt/tavla/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
    }

    location / {
        try_files \\$uri \\$uri/ /index.html;
    }
}
NGXEOF

ln -sf /etc/nginx/sites-available/tavla /etc/nginx/sites-enabled/tavla
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "==> Configuring auto-login as root on console..."
mkdir -p /etc/systemd/system/console-getty.service.d
cat > /etc/systemd/system/console-getty.service.d/autologin.conf <<AUTOEOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noclear %I \\$TERM
AUTOEOF
systemctl daemon-reload

echo ""
echo "Tavla installed successfully."
INNER_EOF
)

# Write the script into the container via pct push
TMPSCRIPT=$(mktemp /tmp/tavla-setup-XXXXXX.sh)
echo "$INNER_SCRIPT" > "$TMPSCRIPT"
pct push "$CTID" "$TMPSCRIPT" /root/tavla-setup.sh
rm -f "$TMPSCRIPT"

pct exec "$CTID" -- bash /root/tavla-setup.sh \
    || die "Setup script inside container failed. Inspect with: pct enter $CTID"

pct exec "$CTID" -- rm -f /root/tavla-setup.sh

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 7: Done — print summary
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Installation complete!                  ║"
echo "╠══════════════════════════════════════════════════════╣"
printf "║  URL:       http://%-33s║\n" "${CT_IP}"
printf "║  CTID:      %-37s║\n" "${CTID}"
printf "║  Branch:    %-37s║\n" "${SELECTED_BRANCH}"
printf "║  Hostname:  %-37s║\n" "${CT_HOSTNAME}"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  To update Tavla, run inside the container:          ║"
echo "║    pct enter ${CTID}                                    ║"
echo "║    bash /opt/tavla/update.sh                         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
