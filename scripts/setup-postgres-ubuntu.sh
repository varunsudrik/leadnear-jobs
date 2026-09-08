#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/.env.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Create it first: cp .env.example .env.local"
  exit 1
fi

read_env() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  printf '%s' "${line#*=}" | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}

DB_HOST="$(read_env DB_HOST)"
DB_PORT="$(read_env DB_PORT)"
DB_USER="$(read_env DB_USER)"
DB_PASS="$(read_env DB_PASS)"
DB_NAME="$(read_env DB_NAME)"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"

if [[ "$DB_HOST" != "127.0.0.1" && "$DB_HOST" != "localhost" ]]; then
  echo "DB_HOST must be 127.0.0.1 or localhost for the local VPS installation."
  exit 1
fi

if [[ ! "$DB_PORT" =~ ^[0-9]+$ ]] || (( DB_PORT < 1 || DB_PORT > 65535 )); then
  echo "DB_PORT must be a valid port number."
  exit 1
fi

if [[ ! "$DB_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "DB_USER may contain only letters, numbers, and underscores."
  exit 1
fi

if [[ ! "$DB_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "DB_NAME may contain only letters, numbers, and underscores."
  exit 1
fi

if [[ -z "$DB_PASS" || "$DB_PASS" == "change-me" ]]; then
  echo "Set a strong DB_PASS in $ENV_FILE before continuing."
  exit 1
fi

if [[ "$(uname -s)" != "Linux" ]] || ! command -v apt-get >/dev/null 2>&1; then
  echo "This installer supports Ubuntu and Debian VPS systems using apt."
  exit 1
fi

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=()
  as_postgres() {
    runuser -u postgres -- "$@"
  }
else
  SUDO=(sudo)
  as_postgres() {
    sudo -u postgres "$@"
  }
fi

echo "Installing PostgreSQL packages..."
"${SUDO[@]}" apt-get update
"${SUDO[@]}" env DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib

PG_VERSION="$(pg_lsclusters --no-header | awk 'NR == 1 { print $1 }')"
if [[ -z "$PG_VERSION" ]]; then
  echo "PostgreSQL was installed, but no database cluster was found."
  exit 1
fi

PG_CONFIG_DIR="/etc/postgresql/$PG_VERSION/main"
POSTGRESQL_CONF="$PG_CONFIG_DIR/postgresql.conf"
PG_HBA_CONF="$PG_CONFIG_DIR/pg_hba.conf"

echo "Configuring PostgreSQL on 127.0.0.1:$DB_PORT..."
"${SUDO[@]}" sed -i "s/^[#[:space:]]*listen_addresses[[:space:]]*=.*/listen_addresses = '127.0.0.1'/" "$POSTGRESQL_CONF"
"${SUDO[@]}" sed -i "s/^[#[:space:]]*port[[:space:]]*=.*/port = $DB_PORT/" "$POSTGRESQL_CONF"

if ! "${SUDO[@]}" grep -qF "host    all             all             127.0.0.1/32            scram-sha-256" "$PG_HBA_CONF"; then
  printf '%s\n' "host    all             all             127.0.0.1/32            scram-sha-256" |
    "${SUDO[@]}" tee -a "$PG_HBA_CONF" >/dev/null
fi

"${SUDO[@]}" systemctl enable postgresql
"${SUDO[@]}" systemctl restart postgresql

echo "Creating database role and database..."
as_postgres psql \
  --port="$DB_PORT" \
  --set=ON_ERROR_STOP=1 \
  --set=db_user="$DB_USER" \
  --set=db_pass="$DB_PASS" \
  --set=db_name="$DB_NAME" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_pass')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'db_user')
\gexec

SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'db_user', :'db_pass')
\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name')
\gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', :'db_name', :'db_user')
\gexec
SQL

as_postgres psql \
  --port="$DB_PORT" \
  --set=ON_ERROR_STOP=1 \
  --dbname="$DB_NAME" \
  --set=db_user="$DB_USER" <<'SQL'
SELECT format('GRANT ALL ON SCHEMA public TO %I', :'db_user')
\gexec
SQL

echo "Checking password connection..."
PGPASSWORD="$DB_PASS" psql \
  --host=127.0.0.1 \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --command="SELECT current_database(), current_user;" >/dev/null

echo
echo "PostgreSQL is ready."
echo "Host: 127.0.0.1"
echo "Port: $DB_PORT"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo
echo "Next command:"
echo "  npm run db:schema"
