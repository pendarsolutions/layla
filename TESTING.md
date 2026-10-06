# Testing Layla API

## Strategy

| Layer | What | Where |
|---|---|---|
| Unit | answer shaping (`to_result`), preset labels, the LRU cache | `tests/test_units.py` |
| API | the HTTP contract against the deterministic `FakeEngine`: success shapes and order, streaming event order, caching, truncation, every validation error, 401 missing/invalid key, anonymous limits (413, 422), 429 with `Retry-After`, 503 busy, cache headers, request-id echo, logs carry context but never text or keys | `tests/test_api.py` |
| Accounts | sign-in (dev and a verified Google token), sessions, logout, CSRF header, keys (create, list, limit, revoke, someone else's key is 404), the free quota (spend, 402, refund on failure, operator keys unlimited), usage per day, models | `tests/test_accounts.py` |
| Traffic | requests per day by channel, failed requests not counted, anonymous visitors hashed and unique per day, active/new users, admin endpoint off without a token and closed to operator keys, one `daily_stats` log line per finished day | `tests/test_traffic.py` |
| Migrations | `alembic upgrade head` → `downgrade base` → `upgrade head` on a fresh database | `tests/test_accounts.py::test_migrations_upgrade_downgrade_upgrade` |
| Integration | every preset is a question the real `laya` package accepts | `tests/test_units.py::test_every_preset_is_a_valid_laya_question` (skips without `laya`) |
| Model quality | accuracy of the served model vs. its evaluation, on a stratified 630-row validation sample | `scripts/` bench (run on the host; see below) |

Tests use a throwaway SQLite file per app; production runs Postgres through the same SQLAlchemy code and the same
migrations. Google is replaced by a fake verifier in tests; the real one checks signature, audience, issuer, expiry and
a verified email.

## Commands

```bash
pip install -r requirements.txt pytest pytest-cov httpx   # install
python -m pytest -q tests/test_units.py                    # unit
python -m pytest -q tests/test_api.py                      # API
python -m pytest -q tests/test_accounts.py                 # accounts, keys, quota, migrations
python -m pytest -q                                        # all (53 tests)
python -m pytest -q --cov=app --cov-report=term-missing    # coverage
```

`pytest.ini` puts `.` and `vendor/` on the path; no model or GPU is needed.

## Last run

2026-10-06, Windows: `53 passed` (traffic statistics added; the Postgres upserts were compiled, not run, locally). 2026-10-03: Site clicked through by hand against the real model locally
(`scripts/run_local_api.bat`): sign-in, key creation, three requests with the key (quota 100 → 97, chart shows 3),
Services → «امتحان کنید» runs in the playground, Docs, phone width.

## Manual checklist

1. Start the service (`docker compose up -d`, or the local command in the README).
2. Open `/docs`.
3. **Authorize** with a key from `.env`.
4. `GET /health` → 200; `GET /ready` → 200 with version and SHA.
5. `POST /api/v1/decisions` with the example body → 200, one result per output, in order.
6. Same body again → same answers, `cached: true`.
7. `outputs: []` → 422 `invalid_request`.
8. No key with `LAYLA_PUBLIC_DEMO=0` → 401 `missing_key`; wrong key → 401 `invalid_key`.
9. With the demo on: 7 outputs without a key → 422 `too_many_outputs`; 31 quick calls → 429 with `Retry-After`.
10. `POST /api/v1/decisions/stream` with `curl -N` → lines arrive one by one, `start` … `done`.
11. `GET /api/v1/outputs` → `Cache-Control: public, max-age=300`; decisions → `no-store`.
12. `docker compose logs layla-api` → one JSON line per request with `request_id`, `caller`, `status`, `duration_ms`,
    and no request text.

## Web page checklist

1. Start page: logo, input, output button, four suggestions.
2. Output button → a window over a dimmed page; ready-made outputs and your own question are visible without scrolling
   (on a phone: two tabs, still no scrolling). Esc, the × and the backdrop close it.
3. Send → each output shows an arch being drawn until its real answer arrives; the counter reads «۱ از ۳», «۲ از ۳».
4. × on a result removes it; «خروجی» on a result adds outputs that run on the same text.
5. Clicking the small logo returns to the start page and cancels any answers still streaming.
6. `?timing=1` shows model time and arrival time per answer.
