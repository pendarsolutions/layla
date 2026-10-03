# Layla (لیلا)

**Powered by Pendar Solutions**

Layla reads Persian text and answers your questions about it. You send a message, a review, a news item or a support
ticket, and for every question you ask you get an answer with its probability:

- **choice**: pick one of several options (which team should handle this message?)
- **yes / no**: the probability of yes (is the customer asking for a refund?)
- **scale**: a place on an ordered scale (how urgent is it?)

This repository is the Layla service: an HTTP API around the Layla 1.0 model and the Layla website, with a playground,
API and docs pages, ready-made services, Google sign-in, and a keys page where every account gets 100 free requests.

## Example

```bash
curl https://<your-host>/api/v1/decisions \
  -H "Authorization: Bearer lyl_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "text": "سفارشم سه روز است نرسیده. لطفاً پولم را برگردانید.",
        "outputs": [
          {"id": "tone",   "preset": "sentiment"},
          {"id": "refund", "type": "yes_no", "question": "آیا مشتری پولش را پس می‌خواهد؟"},
          {"id": "team",   "type": "choice", "question": "به کدام واحد مربوط است؟", "options": ["فروش", "پشتیبانی", "مالی"]}
        ]
      }'
```

```json
{
  "results": [
    {"id": "tone",   "type": "choice", "label": "منفی", "probability": 0.76, "options": [...]},
    {"id": "refund", "type": "yes_no", "label": "بله",  "probability": 0.86, "options": [...]},
    {"id": "team",   "type": "choice", "label": "مالی", "probability": 0.81, "options": [...]}
  ],
  "truncated": false
}
```

`POST /api/v1/decisions/stream` takes the same body and sends each result as its own JSON line the moment it is ready.

## Quick start

You need Python 3.12+ and the Layla 1.0 model folder (not part of this repository, see below).

```bash
python -m venv .venv
.venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install -r requirements.txt

# without the model: a placeholder engine, useful for working on the website (the page shows a red banner)
LAYLA_ENGINE=fake LAYLA_PUBLIC_DEMO=1 LAYLA_DEV_LOGIN=1 PYTHONPATH=.:vendor uvicorn app.main:app --port 8791

# with the model, on CPU
LAYLA_MODEL_PATH=models/layla-1.0 LAYLA_PUBLIC_DEMO=1 LAYLA_DEV_LOGIN=1 PYTHONPATH=.:vendor uvicorn app.main:app --port 8791
```

Open <http://127.0.0.1:8791/>. On Windows, `scripts\run_local_api.bat` does the second command. Locally the accounts
live in SQLite (`layla.db`), and `LAYLA_DEV_LOGIN=1` gives an email sign-in so you can try keys without Google.

**Model weights.** Put the Layla 1.0 folder (`model.safetensors`, `encoder/`, `tokenizer/`, `rl_agent_config.json`)
in `models/layla-1.0/`. It is git-ignored and never baked into the Docker image.

## Self-hosting

```bash
cp .env.example .env            # then fill it in; every setting is explained there
docker compose build
docker compose up -d            # layla-api on 127.0.0.1:8790, plus its Postgres (layla-db)
docker compose logs -f layla-api
docker compose ps
docker compose down
```

The API publishes on `127.0.0.1` only; put nginx in front (`nginx/api.conf`) or reach it through an SSH tunnel
(`scripts/run_local_site.bat user@your-server`). The containers have CPU and memory caps so they can share a server
with other services. Full procedure, Google sign-in setup, backups and rollback: [DEPLOYMENT.md](DEPLOYMENT.md).

## API

Interactive reference (Swagger): `/docs` on any running instance; OpenAPI JSON at `/openapi.json`.

| Method | Path | What it does | Auth | Cache |
|---|---|---|---|---|
| POST | `/api/v1/decisions` | Answer every requested output about `text`, all at once | Key, or anonymous in demo mode | `no-store` |
| POST | `/api/v1/decisions/stream` | Same, one NDJSON line per result as soon as it is ready | Key, or anonymous in demo mode | `no-store` |
| GET | `/api/v1/outputs` | Ready-made outputs (presets) and the request limits | None | `public, max-age=300` |
| GET | `/api/v1/models` | The models served (today: `layla-1.0`) | None | `public, max-age=300` |
| GET | `/api/v1/auth/config` | Which sign-in methods are on | None | `public, max-age=300` |
| POST | `/api/v1/auth/google` | Sign in with a Google ID token; creates the account | CSRF header | `no-store` |
| POST | `/api/v1/auth/dev` | Email sign-in, development only (404 otherwise) | CSRF header | `no-store` |
| POST | `/api/v1/auth/logout` | Sign out | CSRF header | `no-store` |
| GET | `/api/v1/account` | Profile, free quota, premium status, key count | Session | `private, no-store` |
| GET | `/api/v1/account/usage?days=30` | Requests per day made with your keys (1-90 days) | Session | `private, no-store` |
| GET | `/api/v1/keys` | Your active keys (at most 5; secrets never returned) | Session | `private, no-store` |
| POST | `/api/v1/keys` | Create a key; the full secret is in this response only | Session + CSRF | `private, no-store` |
| DELETE | `/api/v1/keys/{id}` | Revoke one of your keys | Session + CSRF | `private, no-store` |
| GET | `/health`, `/ready` | Liveness; readiness (model loaded and database reachable) | None | `no-store` |

The lists (keys, usage days, models, presets) are small and bounded, so nothing is paginated. Decisions are not
stored: the same request gives the same answer, so retries are safe.

**Outputs.** Each output is either a preset (`{"id": "tone", "preset": "sentiment"}`, see `GET /api/v1/outputs`) or
your own question with `type` `choice` (2-12 options), `yes_no`, or `scale` (2-10 levels, lowest first). Results come
back in request order with `answer`, `label`, `probability`, `options` (every option's probability), `confidence`.
Text longer than the model reads keeps its beginning and end, and the response says `truncated: true`.

**Errors** are always `{"error": {"code", "message", "request_id"}}`:

| Status | Code | When |
|---|---|---|
| 401 | `missing_key`, `invalid_key`, `not_signed_in` | No or wrong key; no session |
| 402 | `quota_exhausted` | The account's free requests are used up (premium is coming) |
| 403 | `csrf` | A cookie-authenticated change without `X-Requested-With: layla` |
| 409 | `key_limit` | Creating a sixth key |
| 413 | `text_too_long` | Text over the limit |
| 422 | `invalid_request`, `too_many_outputs`, `invalid_output` | A malformed body; the message says where |
| 429 | `rate_limited` | Too many anonymous requests (`Retry-After` is set) |
| 503 | `not_ready`, `busy` | Still loading, or too many requests in flight (`Retry-After` is set) |
| 504 | `timeout` | The request took too long |

## Authentication and accounts

- **People** sign in on the website with Google (or, in development, with an email). The session is a signed,
  14-day token in an `httpOnly`, `SameSite=Lax` cookie; nothing is kept server-side. Every cookie-authenticated
  change also needs the header `X-Requested-With: layla`.
- **Programs** send `Authorization: Bearer <key>`. Keys (`lyl_...`) are made on the keys page and shown once; only a
  SHA-256 hash and a short prefix are stored. Each successful request with a key spends one of the account's 100 free
  requests; a request that answers nothing is refunded. Operator keys set in `LAYLA_API_KEYS` are unlimited.
- A user only ever sees and changes their own account and keys; the user comes from the session, never from the
  request body, and someone else's key id answers 404.
- In Swagger, click **Authorize** and paste a key. With `LAYLA_PUBLIC_DEMO=1` the decision endpoints also work
  without a key, with lower limits and a per-IP rate limit.

## Configuration

Everything is set with environment variables; [.env.example](.env.example) lists each one with its default and a
comment. The main ones: `LAYLA_MODEL_DIR`, `LAYLA_THREADS` / `LAYLA_CPUS`, `POSTGRES_PASSWORD`,
`LAYLA_SESSION_SECRET`, `LAYLA_GOOGLE_CLIENT_ID`, `LAYLA_FREE_REQUESTS`, `LAYLA_PUBLIC_DEMO`, `LAYLA_CORS_ORIGINS`.

## Database and migrations

Accounts, keys and usage live in Postgres (SQLite locally and in tests), through SQLAlchemy and Alembic migrations in
`migrations/`. The service runs `alembic upgrade head` at startup (`LAYLA_AUTO_MIGRATE=1`). By hand:

```bash
docker compose exec layla-api alembic upgrade head     # migrate
docker compose exec layla-api alembic current          # status
docker compose exec layla-api alembic downgrade -1     # roll back one revision
alembic revision -m "describe the change"              # new migration (locally)
```

Migrations stay backward compatible with the previous release, so rolling back the image never needs a database
rollback.

## Tests

```bash
pip install pytest httpx
python -m pytest -q        # 48 tests; no model, GPU or Postgres needed
```

What each test file covers and the manual checklist: [TESTING.md](TESTING.md).

## How it works

One process holds one copy of the model. Each question is one forward pass, run one at a time on a single worker
thread, so the answers can stream out one by one and the website's progress display waits on real answers. Repeated
(text, question) pairs come from a small in-memory cache. Design notes: [docs/architecture.md](docs/architecture.md).

## Troubleshooting

| Symptom | Check |
|---|---|
| `/ready` stays 503 | `docker compose logs layla-api`: is the model folder mounted and complete; is `layla-db` healthy? |
| The container restarts | `docker inspect layla-api --format '{{.State.OOMKilled}}'`: raise `mem_limit` if true |
| The page cannot reach the API | `curl http://127.0.0.1:8790/health`; is the tunnel open? |
| Browser CORS error | Add the page's origin to `LAYLA_CORS_ORIGINS` |
| Slow answers | Ask for fewer outputs per request, or lower `LAYLA_MAX_TEXT_TOKENS` |

## Known limitations

- CPU inference; time grows with text length × the number of outputs.
- One model copy per container; scale out with more containers behind nginx (the service is stateless). The
  anonymous per-IP limit is per container; nginx `limit_req` is the shared one.
- Signing out clears the cookie, but a copied cookie stays valid until it expires.
- The free quota is per account; there is no paid plan yet.

## Licence

This repository is MIT ([LICENSE](LICENSE)). `vendor/laya/` is the Laya inference package v0.3.7 by Convai
Innovations, Apache-2.0 ([vendor/laya/LICENSE](vendor/laya/LICENSE)), included unchanged so the served code matches
the evaluated code. The Layla 1.0 weights are not in this repository and have their own terms: part of their training
data (Digikala and SnappFood reviews) does not permit commercial use.
