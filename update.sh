#!/usr/bin/env bash
# Run inside the Tavla container: bash /opt/tavla/update.sh
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}==> $*${NC}"; }
ok()   { echo -e "${GREEN}    OK: $*${NC}"; }
die()  { echo -e "${RED}ERROR: $*${NC}" >&2; exit 1; }

[[ -d /opt/tavla/.git ]] || die "/opt/tavla/.git not found. Is this the right container?"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           Tavla — Update                             ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

info "Pulling latest changes from GitHub..."
cd /opt/tavla
git pull --ff-only || die "git pull failed. Resolve any conflicts manually."
ok "Code updated."

info "Installing Python dependencies..."
/opt/tavla/venv/bin/pip install --quiet --upgrade pip
/opt/tavla/venv/bin/pip install --quiet -r requirements.txt
ok "Python packages updated."

info "Running database migrations..."
if [[ -f alembic.ini ]]; then
    /opt/tavla/venv/bin/alembic upgrade head
    ok "Database migrations applied."
else
    echo "    (no alembic.ini — skipping migrations)"
fi

info "Building frontend..."
cd /opt/tavla/frontend
npm install --silent
npm run build --silent
ok "Frontend built."

info "Restarting services..."
systemctl restart tavla
systemctl reload nginx
ok "Services restarted."

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Update complete!                        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
