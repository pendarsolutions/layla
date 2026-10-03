"""Layla API: HTTP surface, auth, limits, streaming, logging. The model lives in engine.py."""
import asyncio
import hmac
import json
import logging
import sys
import threading
import time
import uuid
from contextlib import asynccontextmanager
from collections import defaultdict, deque
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles

from . import config, engine as engine_mod
from .account_routes import build_router
from .accounts import Accounts
from .auth import GoogleVerifier, Sessions
from .db import Database
from .catalog import public_catalog
from .schemas import Catalog, DecisionRequest, DecisionResponse, ErrorResponse, Health, Ready, Result

WEB = Path(__file__).resolve().parent.parent / "web"
NO_STORE = {"Cache-Control": "no-store"}
TYPE_OUT = {"choice": "choice", "noul": "yes_no", "score": "scale"}

log = logging.getLogger("layla")


def _setup_logging():
    if log.handlers:
        return
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(h)
    log.setLevel(logging.INFO)
    log.propagate = False


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, headers: Optional[dict] = None):
        self.status, self.code, self.message, self.headers = status, code, message, headers or {}


class Caller:
    """anonymous (demo tier), an operator key from the environment (unlimited), or a user's key (free quota)."""

    def __init__(self, name: str, anonymous: bool, user_id: Optional[int] = None, key_id: Optional[int] = None):
        self.name, self.anonymous, self.user_id, self.key_id = name, anonymous, user_id, key_id


class RateLimiter:
    """Per-IP sliding window for anonymous callers. Per instance; nginx `limit_req` is the shared limit."""

    def __init__(self, per_min: int):
        self.per_min, self.hits, self.lock = per_min, defaultdict(deque), threading.Lock()

    def check(self, ip: str) -> Optional[int]:
        now = time.monotonic()
        with self.lock:
            q = self.hits[ip]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= self.per_min:
                return int(60 - (now - q[0])) + 1
            q.append(now)
            if len(self.hits) > 10000:
                for k in [k for k, v in self.hits.items() if not v][:5000]:
                    del self.hits[k]
        return None


def to_result(oid: str, labels: dict, ans: dict, ms: float, cached: bool) -> dict:
    t = ans["type"]
    if t == "noul":
        p = float(ans["noul"])
        yes = p >= 0.5
        return {"id": oid, "type": "yes_no", "answer": "yes" if yes else "no", "label": "بله" if yes else "خیر",
                "probability": round(p if yes else 1 - p, 4), "level": None,
                "options": [{"key": "yes", "label": "بله", "probability": round(p, 4)},
                            {"key": "no", "label": "خیر", "probability": round(1 - p, 4)}],
                "confidence": ans.get("confidence", 0.0), "duration_ms": round(ms, 1), "cached": cached}
    probs = ans["probabilities"]
    top = max(probs, key=probs.get)
    return {"id": oid, "type": TYPE_OUT[t], "answer": top, "label": labels.get(top, top),
            "probability": probs[top], "level": ans.get("score") if t == "score" else None,
            "options": [{"key": k, "label": labels.get(k, k), "probability": v} for k, v in probs.items()],
            "confidence": ans.get("confidence", 0.0), "duration_ms": round(ms, 1), "cached": cached}


def create_app(settings: Optional[config.Settings] = None, engine=None, google=None) -> FastAPI:
    s = settings or config.load()
    _setup_logging()
    secret = s.session_secret
    if not secret:
        if s.environment == "production":
            raise RuntimeError("LAYLA_SESSION_SECRET is required in production")
        import secrets as _secrets
        secret = _secrets.token_urlsafe(48)  # development only: sessions end when the process restarts
    db = Database(s.database_url)
    accounts = Accounts(db, s.free_requests, s.max_keys)
    sessions = Sessions(secret, s.session_days, s.cookie_secure)
    google = google or GoogleVerifier(s.google_client_id)
    state = {"runner": None, "error": None}
    inflight = {"n": 0}
    limiter = RateLimiter(s.anon_rate_per_min)

    def _load():
        try:
            eng = engine or engine_mod.build(s)
            state["runner"] = engine_mod.Runner(eng, s.cache_size)
            log.info(json.dumps({"event": "model_ready", "engine": eng.name, "model": s.model_name,
                                 "threads": s.threads, "version": s.version}))
        except Exception as e:  # readiness reports it; liveness stays up so the logs can be read
            state["error"] = repr(e)
            log.error(json.dumps({"event": "model_failed", "error": repr(e)}))

    @asynccontextmanager
    async def lifespan(app):
        if s.auto_migrate:
            db.migrate()
        if engine is not None:
            _load()
        else:
            threading.Thread(target=_load, daemon=True).start()
        yield

    app = FastAPI(
        title="Layla API",
        version=s.version,
        lifespan=lifespan,
        description=(
            "Layla reads Persian text and answers typed questions about it: pick one of several options, "
            "say yes or no, or place it on a scale. One question costs one fast forward pass on CPU.\n\n"
            "**Auth:** send `Authorization: Bearer <key>`. When the public demo is on, calls without a key "
            "are allowed with lower limits and a per-IP rate limit.\n\n"
            "**Caching:** decision responses are `no-store`; `GET /api/v1/outputs` is public for 5 minutes."),
        responses={401: {"model": ErrorResponse}, 429: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
    )
    if s.cors_origins:
        from fastapi.middleware.cors import CORSMiddleware
        app.add_middleware(CORSMiddleware, allow_origins=list(s.cors_origins), allow_credentials=True,
                           allow_methods=["GET", "POST", "DELETE"],
                           allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Requested-With"])

    bearer = HTTPBearer(auto_error=False, description="Your API key (`lyl_...`), created on the keys page.")

    def client_ip(request: Request) -> str:
        if s.trust_proxy:
            fwd = request.headers.get("x-forwarded-for")
            if fwd:
                return fwd.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def caller(request: Request, cred: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> Caller:
        if cred is not None:
            for op_secret, name in s.api_keys.items():
                if hmac.compare_digest(cred.credentials.encode(), op_secret.encode()):
                    request.state.caller = name
                    return Caller(name, False)
            found = await run_in_threadpool(accounts.resolve_key, cred.credentials)
            if found:
                key_id, user_id, key_name = found
                request.state.caller = f"user:{user_id}/key:{key_id}"
                return Caller(key_name, False, user_id=user_id, key_id=key_id)
            raise ApiError(401, "invalid_key", "The API key is not valid.", {"WWW-Authenticate": "Bearer"})
        if not s.public_demo:
            raise ApiError(401, "missing_key", "Send an API key as `Authorization: Bearer <key>`.",
                           {"WWW-Authenticate": "Bearer"})
        wait = limiter.check(client_ip(request))
        if wait:
            raise ApiError(429, "rate_limited", f"Too many requests. Try again in {wait} seconds.",
                           {"Retry-After": str(wait)})
        request.state.caller = "anonymous"
        return Caller("anonymous", True)

    @app.middleware("http")
    async def context(request: Request, call_next):
        rid = request.headers.get("x-request-id", "")[:64] or uuid.uuid4().hex
        request.state.request_id, request.state.caller = rid, "-"
        t = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
        finally:
            if not request.url.path.startswith("/assets"):
                log.info(json.dumps({
                    "request_id": rid, "caller": request.state.caller, "method": request.method,
                    "path": request.url.path, "status": status,
                    "duration_ms": round((time.perf_counter() - t) * 1000, 1), "version": s.version,
                    **getattr(request.state, "log_extra", {})}))
        response.headers["X-Request-ID"] = rid
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path.startswith("/assets/"):
            response.headers["Cache-Control"] = "public, max-age=604800"
        elif "cache-control" not in response.headers:
            response.headers["Cache-Control"] = "no-cache"
        return response

    def err(request: Request, status: int, code: str, message: str, headers: Optional[dict] = None):
        body = {"error": {"code": code, "message": message, "request_id": request.state.request_id}}
        return JSONResponse(body, status_code=status, headers={**NO_STORE, **(headers or {})})

    @app.exception_handler(ApiError)
    async def _api_error(request: Request, e: ApiError):
        return err(request, e.status, e.code, e.message, e.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, e: RequestValidationError):
        first = e.errors()[0] if e.errors() else {}
        where = ".".join(str(p) for p in first.get("loc", [])[1:])
        msg = first.get("msg", "invalid request").removeprefix("Value error, ")
        return err(request, 422, "invalid_request", f"{where}: {msg}" if where else msg)

    # ---- shared request preparation -------------------------------------------------------------

    def prepare(request: Request, req: DecisionRequest, who: Caller):
        runner = state["runner"]
        if runner is None:
            raise ApiError(503, "not_ready", "The model is still loading. Try again in a few seconds.",
                           {"Retry-After": "5"})
        max_chars = s.anon_max_chars if who.anonymous else s.max_chars
        max_outputs = s.anon_max_outputs if who.anonymous else s.max_outputs
        if len(req.text) > max_chars:
            raise ApiError(413, "text_too_long", f"Text is limited to {max_chars} characters.")
        if len(req.outputs) > max_outputs:
            raise ApiError(422, "too_many_outputs", f"Ask for at most {max_outputs} outputs per request.")
        items = []
        for o in req.outputs:
            q, labels = o.to_question()
            try:
                runner.engine.check(o.id, q)
            except ValueError as e:
                raise ApiError(422, "invalid_output", f"{o.id}: {e}")
            items.append((o.id, q, labels))
        if inflight["n"] >= s.max_inflight:
            raise ApiError(503, "busy", "Layla is busy. Try again shortly.", {"Retry-After": "2"})
        text, truncated = runner.engine.fit(req.text)
        request.state.log_extra = {"outputs": len(items), "text_chars": len(req.text), "truncated": truncated}
        return runner, text, truncated, items

    async def charge(who: Caller):
        """User keys spend one request of the free quota per call; the call is refunded if nothing was answered."""
        if who.user_id is None:
            return
        if not await run_in_threadpool(accounts.reserve, who.user_id):
            raise ApiError(402, "quota_exhausted",
                           f"The {s.free_requests} free requests of this account are used up. "
                           "Premium plans are coming soon.")

    async def settle(who: Caller, ok: bool):
        if who.user_id is None:
            return
        if ok:
            await run_in_threadpool(accounts.record, who.user_id, who.key_id)
        else:
            await run_in_threadpool(accounts.refund, who.user_id)

    async def run_one(runner, text, q):
        fut = asyncio.wrap_future(runner.submit(text, q))
        return await asyncio.wait_for(fut, timeout=s.request_timeout_s)

    # ---- routes -----------------------------------------------------------------------------------

    @app.get("/health", response_model=Health, tags=["operations"], summary="Liveness",
             description="The process is up. Does not depend on the model. Not cacheable.")
    def health():
        return JSONResponse({"status": "ok", "version": s.version, "git_sha": s.git_sha}, headers=NO_STORE)

    @app.get("/ready", response_model=Ready, tags=["operations"], summary="Readiness",
             description="200 once the model is loaded and answering; 503 before that. Not cacheable.",
             responses={503: {"model": ErrorResponse}})
    async def ready(request: Request):
        r = state["runner"]
        if r is None:
            msg = "The model failed to load." if state["error"] else "The model is still loading."
            return err(request, 503, "not_ready", msg, {"Retry-After": "5"})
        try:
            await run_in_threadpool(db.ping)
        except Exception:
            return err(request, 503, "not_ready", "The database is not reachable.", {"Retry-After": "5"})
        return JSONResponse({"status": "ready", "version": s.version, "git_sha": s.git_sha,
                             "model": s.model_name, "engine": r.engine.name}, headers=NO_STORE)

    @app.get("/api/v1/outputs", response_model=Catalog, tags=["decisions"], summary="Ready-made outputs",
             description="The ready-made outputs a client can ask for by `preset`, and the caller-tier limits. "
                         "No auth. Cacheable: `public, max-age=300` (changes only with a release).")
    def outputs():
        body = {"outputs": public_catalog(), "limits": {
            "anonymous": {"max_chars": s.anon_max_chars, "max_outputs": s.anon_max_outputs,
                          "requests_per_minute": s.anon_rate_per_min, "enabled": s.public_demo},
            "key": {"max_chars": s.max_chars, "max_outputs": s.max_outputs},
            "max_text_tokens": s.max_text_tokens}}
        return JSONResponse(body, headers={"Cache-Control": "public, max-age=300"})

    @app.post("/api/v1/decisions", response_model=DecisionResponse, tags=["decisions"],
              summary="Answer questions about a text",
              description="Reads `text` and returns one result per requested output, in request order. "
                          "Auth: API key, or anonymous when the public demo is on. Not cacheable (`no-store`). "
                          "Idempotent in effect: the same text and outputs give the same answers.",
              responses={413: {"model": ErrorResponse}, 422: {"model": ErrorResponse},
                         504: {"model": ErrorResponse}})
    async def decisions(request: Request, req: DecisionRequest, who: Caller = Depends(caller)):
        runner, text, truncated, items = prepare(request, req, who)
        await charge(who)
        inflight["n"] += 1
        t = time.perf_counter()
        ok = False
        try:
            results, tokens = [], 0
            for oid, q, labels in items:
                ans, tok, ms, cached = await run_one(runner, text, q)
                tokens = max(tokens, tok)
                results.append(to_result(oid, labels, ans, ms, cached))
            ok = True
        except asyncio.TimeoutError:
            raise ApiError(504, "timeout", "The request took too long. Send shorter text or fewer outputs.")
        finally:
            inflight["n"] -= 1
            await settle(who, ok)
        body = {"request_id": request.state.request_id, "model": s.model_name, "results": results,
                "truncated": truncated, "usage": {"input_tokens": tokens},
                "duration_ms": round((time.perf_counter() - t) * 1000, 1)}
        return JSONResponse(body, headers=NO_STORE)

    @app.post("/api/v1/decisions/stream", tags=["decisions"], summary="Answer questions, streaming each result",
              description=(
                  "Same input, auth and limits as `/api/v1/decisions`. The response is NDJSON "
                  "(`application/x-ndjson`), one event per line, sent the moment it exists:\n\n"
                  "- `{\"event\":\"start\",\"request_id\",\"model\",\"outputs\":[ids],\"truncated\"}`\n"
                  "- `{\"event\":\"result\",\"result\":Result}` once per output, in request order\n"
                  "- `{\"event\":\"error\",\"error\":{code,message}}` if the stream fails part-way\n"
                  "- `{\"event\":\"done\",\"usage\",\"duration_ms\"}`\n\n"
                  "Each result arrives as soon as the model has answered it, so a progress display can "
                  "wait on real answers. Stops working when the client disconnects. Not cacheable."),
              responses={200: {"content": {"application/x-ndjson": {}}}, 413: {"model": ErrorResponse},
                         422: {"model": ErrorResponse}})
    async def decisions_stream(request: Request, req: DecisionRequest, who: Caller = Depends(caller)):
        runner, text, truncated, items = prepare(request, req, who)
        await charge(who)
        rid = request.state.request_id

        async def events():
            inflight["n"] += 1
            t = time.perf_counter()
            tokens, delivered = 0, 0
            try:
                yield json.dumps({"event": "start", "request_id": rid, "model": s.model_name,
                                  "outputs": [i[0] for i in items], "truncated": truncated}) + "\n"
                for oid, q, labels in items:
                    if await request.is_disconnected():
                        return
                    ans, tok, ms, cached = await run_one(runner, text, q)
                    tokens = max(tokens, tok)
                    yield json.dumps({"event": "result", "result": to_result(oid, labels, ans, ms, cached)},
                                     ensure_ascii=False) + "\n"
                    delivered += 1
                yield json.dumps({"event": "done", "usage": {"input_tokens": tokens},
                                  "duration_ms": round((time.perf_counter() - t) * 1000, 1)}) + "\n"
            except asyncio.TimeoutError:
                yield json.dumps({"event": "error", "error": {"code": "timeout",
                                  "message": "The request took too long."}}) + "\n"
            finally:
                inflight["n"] -= 1
                await settle(who, delivered > 0)

        return StreamingResponse(events(), media_type="application/x-ndjson",
                                 headers={**NO_STORE, "X-Accel-Buffering": "no"})

    app.include_router(build_router(s, accounts, sessions, google, limiter, client_ip, ApiError, ErrorResponse))

    if s.serve_web and WEB.exists():
        app.mount("/", StaticFiles(directory=WEB, html=True), name="web")

    return app


app = create_app()
