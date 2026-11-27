#!/usr/bin/env bash
# From a fresh clone to a running DrillSwitch, in one command:
#
#   ./setup.sh
#
# 1. Starts self-hosted Flagsmith and DrillSwitch's own Postgres in Docker.
# 2. First run only: creates a Flagsmith admin user, an organisation and an organisation
#    API key, and keeps them in infra/.admin.env (gitignored, readable only by you).
# 3. Configures Flagsmith for DrillSwitch (project, environments, segments, experiment,
#    plan flags) and writes web/.env.local for the app.
# 4. Writes infra/flagsmith.env so the Flagsmith CLI talks to this instance.
#
# Safe to run again: everything is found and reused. Nothing leaves this machine.
# Optional overrides: COMPOSE_PROJECT, FLAGSMITH_PORT, FLAGSMITH_PROCESSOR_PORT, APPDB_PORT,
# ADMIN_ENV_FILE, CLI_ENV_FILE, APP_ENV_FILE (used to test a second copy side by side).
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$PWD

PROJECT=${COMPOSE_PROJECT:-drillswitch}
export FLAGSMITH_PORT=${FLAGSMITH_PORT:-8000}
export FLAGSMITH_PROCESSOR_PORT=${FLAGSMITH_PROCESSOR_PORT:-8001}
export APPDB_PORT=${APPDB_PORT:-5433}
ADMIN_ENV=${ADMIN_ENV_FILE:-$ROOT/infra/.admin.env}
CLI_ENV=${CLI_ENV_FILE:-$ROOT/infra/flagsmith.env}
APP_ENV=${APP_ENV_FILE:-$ROOT/web/.env.local}
URL=http://localhost:$FLAGSMITH_PORT
API=$URL/api/v1
COMPOSE=(docker compose -f infra/docker-compose.yml -f infra/docker-compose.app.yml -p "$PROJECT")

say() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
die() { printf '\nsetup: %s\n' "$*" >&2; exit 1; }
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);const r=(new Function("d",`return (${process.argv[1]})`))(v);if(r===undefined||r===null)process.exit(1);console.log(r)})' "$1"; }
get() { [ -f "$ADMIN_ENV" ] && grep -E "^$1=" "$ADMIN_ENV" | tail -1 | cut -d= -f2- || true; }

# ---------- Prerequisites ----------
command -v docker >/dev/null || die "Docker is required: Docker Desktop, or Docker Engine with Compose v2."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (the 'docker compose' command)."
docker info >/dev/null 2>&1 || die "Docker is installed but not running. Start Docker and run ./setup.sh again."
command -v node >/dev/null || die "Node.js 20 or newer is required."
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || die "Node.js 20 or newer is required (found $(node -v))."
command -v curl >/dev/null || die "curl is required."
command -v openssl >/dev/null || die "openssl is required."

# ---------- 1. Containers ----------
say "Starting Flagsmith and the DrillSwitch database (Docker project '$PROJECT', Flagsmith on port $FLAGSMITH_PORT)"
"${COMPOSE[@]}" up -d --quiet-pull
printf 'Waiting for Flagsmith'
for i in $(seq 1 150); do
  curl -fsS "$URL/health/readiness/" >/dev/null 2>&1 && break
  [ "$i" = 150 ] && die "Flagsmith did not start on $URL. See: ${COMPOSE[*]} logs flagsmith"
  printf '.'
  sleep 2
done
echo " ready."

# ---------- 2. Admin, organisation and API key (first run) ----------
umask 077
mkdir -p "$(dirname "$ADMIN_ENV")"
if [ -z "$(get FLAGSMITH_API_KEY)" ]; then
  say "Creating a Flagsmith admin, organisation and organisation API key"
  EMAIL=$(get FLAGSMITH_ADMIN_EMAIL)
  PW=$(get FLAGSMITH_ADMIN_PASSWORD)
  if [ -z "$PW" ]; then
    EMAIL=admin@drillswitch.local
    PW=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)
    "${COMPOSE[@]}" exec -T -e DJANGO_SUPERUSER_EMAIL="$EMAIL" -e DJANGO_SUPERUSER_PASSWORD="$PW" flagsmith \
      flagsmith createsuperuser --noinput --first_name Drill --last_name Admin --sign_up_type NO_INVITE >/dev/null 2>&1 ||
      die "Could not create the Flagsmith admin user. If one already exists, put its FLAGSMITH_ADMIN_EMAIL and FLAGSMITH_ADMIN_PASSWORD in $ADMIN_ENV."
    printf 'FLAGSMITH_ADMIN_EMAIL=%s\nFLAGSMITH_ADMIN_PASSWORD=%s\n' "$EMAIL" "$PW" >"$ADMIN_ENV"
    echo "Admin user $EMAIL created; password saved in $ADMIN_ENV."
  fi

  TOKEN=$(curl -fsS -X POST "$API/auth/login/" -H 'content-type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" | json 'd.key') || die "Could not log in to Flagsmith as $EMAIL."
  AUTH="Authorization: Token $TOKEN"

  ORG_ID=$(curl -fsS "$API/organisations/" -H "$AUTH" | json '(d.results ?? d)[0]?.id' || true)
  if [ -z "$ORG_ID" ]; then
    ORG_ID=$(curl -fsS -X POST "$API/organisations/" -H "$AUTH" -H 'content-type: application/json' \
      -d '{"name":"DrillSwitch"}' | json 'd.id') || die "Could not create the Flagsmith organisation."
    echo "Organisation DrillSwitch created."
  fi

  KEY=$(curl -fsS -X POST "$API/organisations/$ORG_ID/master-api-keys/" -H "$AUTH" -H 'content-type: application/json' \
    -d '{"name":"drillswitch-server","is_admin":true}' | json 'd.key') || die "Could not create the organisation API key."
  echo "FLAGSMITH_API_KEY=$KEY" >>"$ADMIN_ENV"
  echo "Organisation API key created and saved in $ADMIN_ENV."
fi
FLAGSMITH_API_KEY=$(get FLAGSMITH_API_KEY)

# ---------- 3. App dependencies and Flagsmith configuration ----------
say "Installing the web app's dependencies"
(cd web && npm install --no-audit --no-fund --loglevel=error)

say "Configuring Flagsmith for DrillSwitch"
(cd web && FLAGSMITH_URL="$URL" FLAGSMITH_API_KEY="$FLAGSMITH_API_KEY" BOOTSTRAP_ENV_FILE="$APP_ENV" \
  DATABASE_URL="postgres://drillswitch:drillswitch@127.0.0.1:$APPDB_PORT/drillswitch" node scripts/bootstrap.mjs) |
  grep -v '^Dashboard:' || die "Configuring Flagsmith failed (see the messages above)."
chmod 600 "$APP_ENV" "$ADMIN_ENV"

# ---------- 4. Flagsmith CLI settings ----------
PROJECT_ID=$(grep -E '^FLAGSMITH_PROJECT_ID=' "$APP_ENV" | cut -d= -f2)
cat >"$CLI_ENV" <<EOF
export FLAGSMITH_API_URL=$URL
export FLAGSMITH_SDK_API_URL=$URL
export FLAGSMITH_API_KEY_localhost_$FLAGSMITH_PORT=$FLAGSMITH_API_KEY
export FLAGSMITH_PROJECT=$PROJECT_ID
EOF
chmod 600 "$CLI_ENV"

cat <<EOF

$(printf '\033[1m')DrillSwitch is ready.$(printf '\033[0m')

  Start the app        cd web && npm run dev          → http://localhost:3100
  Flagsmith dashboard  $URL      (login: $(get FLAGSMITH_ADMIN_EMAIL), password in ${ADMIN_ENV#"$ROOT"/})

Optional, all in web/.env.local:
  Team workspaces      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY from a Clerk app
  AI copilot           GEMINI_API_KEY from https://aistudio.google.com/apikey (free tier)

Also:
  Simulated players    cd web && npm run simulate
  CLI skill            set -a; . ${CLI_ENV#"$ROOT"/}; set +a; then follow skills/put-out-the-fire/SKILL.md
EOF
