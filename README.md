# Layla (لیلا)

**Powered by Pendar Solutions**

Layla reads Persian text and answers typed questions about it: pick one of several options (`choice`), say yes or no
(`yes_no`), or place it on an ordered scale (`scale`). This service puts the Layla 1.0 model (mmBERT-base, 322M) behind
an HTTP API and serves the Layla website: a playground, an API page, docs, ready-made services, Google sign-in
and a keys page where each account creates API keys and spends its 100 free requests (premium is "coming soon").

- Swagger UI: `http://<host>/docs` (locally through the tunnel: <http://127.0.0.1:8790/docs>)
- OpenAPI JSON: `/openapi.json`
- Deployment: [DEPLOYMENT.md](DEPLOYMENT.md) · Testing: [TESTING.md](TESTING.md) · Design: [docs/architecture.md](docs/architecture.md)

**What is in this repository:** the API (`app/`), the website (`web/`), migrations, tests, Docker/Compose/nginx files.
**What is not:** the model weights. Put the Layla 1.0 folder (`model.safetensors`, `encoder/`, `tokenizer/`,
`rl_agent_config.json`) in `models/layla-1.0/`; it is git-ignored.

**Licence:** this repository is MIT (see `LICENSE`). `vendor/laya/` is the Laya inference package v0.3.7 by Convai
Innovations, Apache-2.0 (its licence is in `vendor/laya/LICENSE`), vendored unchanged so the served code matches the
evaluated code. The model weights have their own terms: part of Layla 1.0's training data (Digikala and SnappFood
reviews) does not permit commercial use.

## 1. Architecture in one paragraph

One stateless FastAPI process holds one copy of the model on CPU. Every question is one forward pass. The passes run
one at a time on a single worker thread that uses `LAYLA_THREADS` cores. On CPU a batch of N questions costs N times one
question, so answering them one by one costs the same in total, and the streaming endpoint can send each answer the
moment it exists. A small in-memory cache returns repeated (text, question) pairs instantly. The container is capped
(CPU, memory, no swap, low CPU priority, first to be OOM-killed), so it cannot starve other services on a shared host.

## 2. Endpoints

| Method | Path | Purpose | Auth | Cache |
|---|---|---|---|---|
| POST | `/api/v1/decisions` | Answer every requested output about `text`; returns all results at once | Key, or anonymous when the demo is on | `no-store` |
| POST | `/api/v1/decisions/stream` | Same input; NDJSON stream, one line per result as soon as it is ready | Key, or anonymous when the demo is on | `no-store` |
| GET | `/api/v1/outputs` | The ready-made outputs (presets) and the caller-tier limits | None | `public, max-age=300` |
| GET | `/api/v1/models` | The models served (today: `layla-1.0`) | None | `public, max-age=300` |
| GET | `/api/v1/auth/config` | Which sign-in methods are on (Google client id, dev login) | None | `public, max-age=300` |
| POST | `/api/v1/auth/google` | Sign in with a Google ID token; creates the account with its free quota; sets the session cookie | CSRF header | `no-store` |
| POST | `/api/v1/auth/dev` | Email sign-in without Google, development only (404 otherwise) | CSRF header | `no-store` |
| POST | `/api/v1/auth/logout` | Clear the session cookie | CSRF header | `no-store` |
| GET | `/api/v1/account` | Account overview: profile, free quota, premium status, key count | Session | `private, no-store` |
| GET | `/api/v1/account/usage?days=30` | Requests per day made with the user's keys (1-90 days, bounded, not paginated) | Session | `private, no-store` |
| GET | `/api/v1/keys` | The user's active keys, newest first (max 5, not paginated); never the secret | Session | `private, no-store` |
| POST | `/api/v1/keys` | Create a key; the secret is in this response only; 409 at the limit | Session + CSRF | `private, no-store` |
| DELETE | `/api/v1/keys/{id}` | Revoke one of the user's keys; someone else's key is 404 | Session + CSRF | `private, no-store` |
| GET | `/health` | Liveness: the process is up | None | `no-store` |
| GET | `/ready` | Readiness: the model is loaded and answering (503 before) | None | `no-store` |
| GET | `/` | The web page (when `LAYLA_SERVE_WEB=1`) | None | `no-cache`; `/assets/*` 7 days |

The only lists (keys, usage days, models, presets) are small and bounded by design, so nothing is paginated. Decisions are not stored anywhere: the same request always gives
the same answer, and nothing is created, so retries are safe.

**Request** (`/api/v1/decisions` and `/stream`):

```json
{
  "text": "سفارشم سه روز پیش ثبت شد و هنوز نرسیده. لطفاً پولم را برگردانید.",
  "outputs": [
    {"id": "tone", "preset": "sentiment"},
    {"id": "refund", "type": "yes_no", "question": "آیا مشتری پولش را پس می‌خواهد؟"},
    {"id": "team", "type": "choice", "question": "به کدام واحد مربوط است؟", "options": ["فروش", "پشتیبانی", "مالی"]},
    {"id": "anger", "type": "scale", "question": "مشتری چقدر عصبانی است؟", "options": ["آرام", "ناراضی", "عصبانی"]}
  ]
}
```

**Result** (one per output, in request order): `id`, `type`, `answer` (key, `yes`/`no`, or level index), `label`
(display words), `probability`, `level` (scale only: expected level), `options[]` (every option with its probability),
`confidence`, `duration_ms` (model time), `cached`.

**Stream events** (`application/x-ndjson`): `start` → `result` × N → `done` (or `error` if it fails part-way).

**Errors** always look like `{"error": {"code", "message", "request_id"}}`:

| Status | code | When |
|---|---|---|
| 401 | `missing_key` / `invalid_key` | No key while the demo is off; a key that is not valid (even when the demo is on) |
| 413 | `text_too_long` | Text over the caller's character limit |
| 402 | `quota_exhausted` | A user key whose account has used its free requests ("premium is coming") |
| 403 | `csrf` | A cookie-authenticated change without `X-Requested-With: layla` |
| 409 | `key_limit` | Creating a key when the account already has the maximum |
| 422 | `invalid_request`, `too_many_outputs`, `invalid_output` | Bad body, too many outputs, an output the model cannot take |
| 429 | `rate_limited` | Anonymous caller over its per-minute limit (`Retry-After` set) |
| 503 | `not_ready`, `busy` | Model still loading; too many requests in flight (`Retry-After` set) |
| 504 | `timeout` | A request took longer than `LAYLA_REQUEST_TIMEOUT_S` |

## 3. Authentication and authorization

- **People** sign in with Google on the website (or, in development only, with an email). The session is a signed
  14-day JWT in an `httpOnly`, `SameSite=Lax` cookie; nothing is stored server-side. Every cookie-authenticated change
  also needs the header `X-Requested-With: layla` (CSRF guard).
- **Programs** send `Authorization: Bearer <key>`. User keys (`lyl_...`) are created on the keys page; only a SHA-256
  hash and a 12-character prefix are stored, and the full key is shown once. Each successful request with a user key
  spends one of the account's free requests (default 100); a request that answers nothing is refunded; at zero the API
  answers 402. Operator keys from `LAYLA_API_KEYS` (`name:secret,...`) are unlimited. The logs show the key's owner and
  id, never the secret.
- With `LAYLA_PUBLIC_DEMO=1`, requests **without** a key are served as `anonymous`, with lower limits and a per-IP
  rate limit. A wrong key is still rejected.
- Authorization: a user sees and changes only their own account and keys; the user is always taken from the session,
  never from the request, and another user's key id answers 404 like a missing one.
- In Swagger: click **Authorize** and paste the key. The anonymous tier lets you try the endpoints without one when the
  demo is on.

## 4. Requirements

Docker 28+ with Compose v2 on the host. The model folder `layla-1.0/` (`model.safetensors`, `encoder/`, `tokenizer/`,
`rl_agent_config.json`) is supplied separately; it is not in git or in the image. Local development: Python 3.12+.

## 5. Environment variables

All of them are listed with defaults and comments in [.env.example](.env.example). The ones that matter most:
`LAYLA_VERSION`, `LAYLA_MODEL_DIR`, `LAYLA_THREADS` / `LAYLA_CPUS`, `LAYLA_API_KEYS`, `LAYLA_PUBLIC_DEMO`,
`LAYLA_MAX_TEXT_TOKENS`, `LAYLA_MAX_INFLIGHT`, `LAYLA_CORS_ORIGINS`, `LAYLA_TRUST_PROXY`.

## 6. Local development

```bash
python -m venv .venv && .venv/Scripts/pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv/Scripts/pip install -r requirements.txt pytest httpx
# no model needed: the fake engine gives deterministic answers
LAYLA_ENGINE=fake LAYLA_PUBLIC_DEMO=1 PYTHONPATH=".;vendor" uvicorn app.main:app --port 8791
# with the real model on CPU
LAYLA_MODEL_PATH=../models/layla-1.0 LAYLA_PUBLIC_DEMO=1 PYTHONPATH=".;vendor" uvicorn app.main:app --port 8791
```

Open <http://127.0.0.1:8791/>. `LAYLA_FAKE_DELAY_MS=900` slows the fake engine so the waiting states can be seen.

**The web page against the server API:** `scripts\run_local_site.bat` opens an SSH tunnel (local 8790 → server
127.0.0.1:8790), serves `web/` on <http://127.0.0.1:5500> and opens
`http://127.0.0.1:5500/?api=http://127.0.0.1:8790&timing=1`. `timing=1` shows model time, arrival time per answer and
the total/server/first-byte times per request. The server's `.env` must list `http://127.0.0.1:5500` in
`LAYLA_CORS_ORIGINS`.

## 7–8. Docker and Compose

```bash
docker build -t layla-api:1.0.0 --build-arg LAYLA_VERSION=1.0.0 --build-arg LAYLA_GIT_SHA=$(git rev-parse --short HEAD) .
docker run --env-file .env -p 127.0.0.1:8790:8000 -v "$PWD/models/layla-1.0:/models/layla-1.0:ro" layla-api:1.0.0

docker compose build                 # build
docker compose up -d                 # start
docker compose logs -f layla-api     # logs
docker compose ps                    # status
docker compose down                  # stop
docker compose build --no-cache layla-api && docker compose up -d layla-api   # rebuild
```

Compose here is a **single-server deployment** for a shared host (staging / temporary production) until the dedicated
server arrives.

## 9. Database migration

Accounts live in Postgres (SQLite locally and in tests). Migrations are Alembic, in `migrations/`; the service runs
`alembic upgrade head` at startup when `LAYLA_AUTO_MIGRATE=1` (default). By hand, inside the container:

```bash
docker compose exec layla-api alembic upgrade head          # run migrations
docker compose exec layla-api alembic current               # status
docker compose exec layla-api alembic downgrade -1          # roll back one revision
alembic revision -m "describe the change"                   # create (locally, then edit the new file)
```

Migrations must stay backward compatible with the previous release so that a rollback of the image works without a
database rollback. Back up before any destructive revision (see DEPLOYMENT.md).

## 10. Testing

See [TESTING.md](TESTING.md). Short version: `python -m pytest -q` (47 tests, no model, no Postgres needed).

## 11–12. Swagger and trying it

Swagger UI at `/docs`. Manual flow: open `/docs` → `GET /health` → `GET /ready` → `GET /api/v1/outputs` →
**Authorize** with a key → `POST /api/v1/decisions` with the example body → try an empty `outputs` list (422), no key
with the demo off (401), a wrong key (401).

## 13. Cacheability

Decisions are `no-store` (the text may be private). `/api/v1/outputs` is `public, max-age=300` and changes only with a
release. Health endpoints are `no-store`. Static assets are cached for 7 days, the page itself is `no-cache`. The
in-process answer cache is a speed-up only: an empty or lost cache changes latency, never answers.

## 14. Nginx / domain

[nginx/api.conf](nginx/api.conf): `layla.example.com` (placeholder; no subdomain chosen yet) → nginx (TLS, rate limit,
256 KB body limit) → `127.0.0.1:8790` → container port 8000. The streaming route has `proxy_buffering off`.
Set `LAYLA_TRUST_PROXY=1` once nginx is in front so the anonymous rate limit sees real client IPs.

## 15–16. Deployment and rollback

See [DEPLOYMENT.md](DEPLOYMENT.md).

## 17. Troubleshooting

| Symptom | Check |
|---|---|
| `/ready` stays 503 | `docker compose logs layla-api` for `model_failed`; is the model folder mounted and complete? |
| Container restarts | `docker inspect layla-api --format '{{.State.OOMKilled}}'`. If true, the host ran out of memory. |
| Page says it cannot reach the server | Is the tunnel window open? `curl http://127.0.0.1:8790/health` locally. |
| Browser CORS error | Add the page's origin to `LAYLA_CORS_ORIGINS` and `docker compose up -d`. |
| Slow answers | Fewer outputs per request; lower `LAYLA_MAX_TEXT_TOKENS`; the host may be busy (CPU share is low on purpose). |

## 18. Known limitations

- CPU only. Measured on the 12-vCPU EPYC host: ~100 ms for a short message with one output, ~250 ms for a paragraph,
  ~1 s for 900 tokens; cost grows with text length × number of outputs.
- int8 quantization was tested and rejected: 2× faster, but mean macro-F1 fell from 0.78 to 0.67.
- One model copy per container; to scale, run more containers behind nginx (the service is stateless). The per-IP
  anonymous limit is per instance; nginx `limit_req` is the shared limit.
- Licence: Layla 1.0 was trained partly on Digikala/SnappFood reviews whose terms bar commercial use.
- Sessions are stateless: signing out clears the cookie, but a copied cookie stays valid until it expires (14 days).
- The quota is per account, not per key, and there is no paid plan yet.
