#!/usr/bin/env bash
# Deploy the committed HEAD of this repo to a Docker host over SSH.
#   scripts/deploy.sh user@your-server [path-to-local-model-dir]
# Idempotent. The container binds to 127.0.0.1 only; nothing else on the host is touched.
set -euo pipefail
HOST="${1:?usage: deploy.sh user@host [model-dir]}"
MODEL_DIR="${2:-}"
cd "$(dirname "$0")/.."
SHA="$(git rev-parse --short HEAD)"
VERSION="$(git describe --tags --exact-match 2>/dev/null | sed 's/^v//' || echo "0.0.0-$SHA")"
ARCHIVE="$(mktemp -t layla-api-XXXX.tgz)"
git archive --format=tar.gz -o "$ARCHIVE" HEAD
echo "deploying layla-api $VERSION ($SHA) to $HOST"
scp -q "$ARCHIVE" "$HOST:/tmp/layla-api-$SHA.tgz"
if [ -n "$MODEL_DIR" ]; then
  ssh "$HOST" 'mkdir -p ~/layla-api/models/layla-1.0'
  scp -q -r "$MODEL_DIR"/. "$HOST:layla-api/models/layla-1.0/"
fi
ssh "$HOST" SHA="$SHA" VERSION="$VERSION" bash -s <<'REMOTE'
set -euo pipefail
mkdir -p ~/layla-api/models && cd ~/layla-api
tar xzf "/tmp/layla-api-$SHA.tgz" && rm "/tmp/layla-api-$SHA.tgz"
test -f models/layla-1.0/model.safetensors || { echo "model missing in ~/layla-api/models/layla-1.0" >&2; exit 1; }
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^LAYLA_API_KEYS=.*|LAYLA_API_KEYS=owner:$(openssl rand -hex 24)|" .env
  chmod 600 .env
  echo "created .env with a new owner key (read it with: grep LAYLA_API_KEYS ~/layla-api/.env)"
fi
sed -i "s|^LAYLA_VERSION=.*|LAYLA_VERSION=$VERSION|; s|^LAYLA_GIT_SHA=.*|LAYLA_GIT_SHA=$SHA|" .env
# settings added in later releases: append missing ones, and generate secrets that are still empty
while IFS= read -r line; do
  key="${line%%=*}"; case "$key" in ''|\#*) continue;; esac
  grep -q "^$key=" .env || echo "$line" >> .env
done < .env.example
for key in POSTGRES_PASSWORD LAYLA_SESSION_SECRET; do
  if grep -qE "^$key=\s*(#.*)?$" .env; then sed -i "s|^$key=.*|$key=$(openssl rand -hex 32)|" .env; fi
done
nice -n 15 docker compose build
docker compose up -d
for i in $(seq 1 60); do
  curl -fsS http://127.0.0.1:8790/ready >/dev/null 2>&1 && break; sleep 2
done
docker compose ps
curl -sS http://127.0.0.1:8790/ready; echo
REMOTE
rm -f "$ARCHIVE"
