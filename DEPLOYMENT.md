# Deploying Layla API

## What

- Service: `layla-api` (image `layla-api:<version>`), one container.
- Version: the git tag (`v1.0.0` → `1.0.0`) plus the short commit SHA, both visible at `/health` and `/ready`.
- Environment now: **staging on a shared host** (a CPU-only Linux server that also runs other services), reached as
  `user@your-server` below. A dedicated server will replace it.

## Prerequisites

- Docker 28+ and Compose v2 on the host; the deploy user in the `docker` group.
- The model folder at `~/layla-api/models/layla-1.0` on the host.
- No DNS yet: the API listens on the host's `127.0.0.1:8790` only. Reach it with an SSH tunnel or put nginx in front
  (`nginx/api.conf`) once a subdomain exists.
- Secrets: `~/layla-api/.env` on the host only (mode 600). `LAYLA_API_KEYS` is generated on first deploy.

## Accounts: Postgres and Google sign-in

- `layla-db` (Postgres 16) runs next to the API in the same compose project, with no published port, 256 MB and half
  a CPU. Its data is the named volume `layla-db-data`. `POSTGRES_PASSWORD` and `LAYLA_SESSION_SECRET` are generated
  by `scripts/deploy.sh` the first time they are empty.
- Google sign-in needs an OAuth client: Google Cloud Console → APIs & Services → Credentials → Create credentials →
  OAuth client ID → *Web application*. Add every origin the site is opened from under **Authorized JavaScript
  origins** (for example `http://localhost:8790` through the tunnel, later `https://<subdomain>`), then put the client
  id in `.env` as `LAYLA_GOOGLE_CLIENT_ID` and `docker compose up -d`. Without it the sign-in page says Google sign-in
  is not set up; `LAYLA_DEV_LOGIN=1` gives an email sign-in for staging (it is ignored when `LAYLA_ENV=production`).
- Behind HTTPS set `LAYLA_COOKIE_SECURE=1`.

### Backup and restore

```bash
docker compose exec -T layla-db pg_dump -U layla -Fc layla > layla-$(date +%F).dump        # backup
docker compose exec -T layla-db pg_restore -U layla -d layla --clean < layla-YYYY-MM-DD.dump  # restore
```

## Guard rails on a shared host (compose.yaml)

| Setting | Value | Why |
|---|---|---|
| `cpus` | 6 | never more than half the machine |
| `cpu_shares` | 256 | under contention the other services get 4× Layla's share |
| `mem_limit` / `memswap_limit` | 3000m / 3000m | model ≈1.3 GB; measured 1.8-2.4 GB after warm-up; no swap (the host's swap is already full) |
| `layla-db` | 0.5 CPU, 256 MB, no port | accounts only; small |
| `oom_score_adj` | 800 | if the host runs out of memory, the kernel kills Layla before anything else |
| ports | `127.0.0.1:8790` | nothing exposed publicly |
| `read_only`, `no-new-privileges`, non-root user | | least privilege |
| `LAYLA_MAX_INFLIGHT` | 12 | beyond this the API answers 503 instead of queueing without bound |

## Build and deploy

From a machine with this repo (release = the committed HEAD, tagged):

```bash
git tag v1.0.0                       # once per release
scripts/deploy.sh user@your-server                  # model already on the host
scripts/deploy.sh user@your-server ../models/layla-1.0   # first time: also copies the model (~650 MB)
```

The script uploads `git archive HEAD`, keeps the existing `.env` (creates it with a new key the first time), sets
`LAYLA_VERSION`/`LAYLA_GIT_SHA`, then on the host runs:

```bash
cd ~/layla-api
nice -n 15 docker compose build
docker compose up -d
```

## Migration

Automatic at startup (`LAYLA_AUTO_MIGRATE=1`). Check with `docker compose exec layla-api alembic current`. Back up the
database before a release whose migration drops or rewrites data.

## Traffic: users and requests per day

Every decision request is counted per UTC day by channel: `anonymous` (the playground, no key), `user_key` (an
account's API key) and `operator_key` (`LAYLA_API_KEYS`), with failed requests and the number of outputs answered.
Users per day: `anonymous_visitors` (unique per day by a daily-rotating hash of the IP, so no IP is ever stored),
`active_users` (accounts that made a request with a key), `new_users` (sign-ups) and the account totals. Counts are
kept in memory and written to Postgres (`traffic_daily`, `visitors_daily`) every `LAYLA_TRAFFIC_FLUSH_S` seconds and
at shutdown; a hard crash can lose at most that last minute.

- **Logged:** when a UTC day ends, the API writes one line to its log:
  `{"event": "daily_stats", "day": "2026-10-06", "requests": 412, "failed": 0, "outputs": 1630, "by_channel": {...},
  "anonymous_visitors": 57, "active_users": 4, "new_users": 3, "users_total": 21}`.
  Find them with `docker compose logs layla-api | grep daily_stats`. The json-file log rotates (3 × 10 MB), so the
  database is the long-term record.
- **Table:** `docker compose exec layla-api python -m app.stats_cli --days 30` (add `--json` for the raw report).
- **HTTP:** set `LAYLA_ADMIN_TOKEN` in `.env`, then
  `curl -H "Authorization: Bearer $LAYLA_ADMIN_TOKEN" http://127.0.0.1:8790/api/v1/admin/stats?days=30`.
  Off (404) while the token is empty.
- **Behind nginx, set `LAYLA_TRUST_PROXY=1`**, or every visitor has nginx's address and counts as one.

## Verify

```bash
ssh user@your-server
cd ~/layla-api && docker compose ps && docker compose logs --tail 20 layla-api
curl -i http://127.0.0.1:8790/health
curl -i http://127.0.0.1:8790/ready
curl -s http://127.0.0.1:8790/api/v1/decisions -H 'Content-Type: application/json' \
  -d '{"text":"غذا سرد رسید","outputs":[{"id":"t","preset":"sentiment"}]}'
docker stats --no-stream layla-api          # CPU and memory stay inside the limits
```

Swagger: `http://127.0.0.1:8790/docs` through the tunnel (`ssh -N -L 8790:127.0.0.1:8790 user@your-server`).

## Rollback

Images are tagged by version, so the previous image is still on the host:

```bash
cd ~/layla-api
sed -i 's/^LAYLA_VERSION=.*/LAYLA_VERSION=<previous-version>/' .env
docker compose up -d          # starts the previous image; no rebuild
```

For a code rollback from git: `git checkout v<previous>` locally and run `scripts/deploy.sh` again.

## Remove completely

```bash
cd ~/layla-api && docker compose down && docker image rm layla-api:<version>
docker volume rm layla-api_layla-db-data   # deletes every account and key
rm -rf ~/layla-api            # includes the model folder and .env
```

## Post-deployment checks

- `/health` 200 and `/ready` 200 with the expected `version` and `git_sha`
- Swagger reachable through the tunnel
- a request with the owner key works; a wrong key gets 401
- `docker stats` shows the container inside its CPU and memory limits
- logs show JSON request lines with no request text or keys in them
- the other services on the host are unaffected (`docker ps`, `uptime`, `free -h` before and after)
