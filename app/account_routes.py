"""Sign-in, account overview, API keys, usage and the model list.

Cookie-authenticated changes (sign-in, sign-out, creating or revoking keys) also require the header
`X-Requested-With: layla`. A cross-site form cannot set it, and a cross-origin script cannot send it without passing
the CORS check, so a session cookie alone can never change anything.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from .auth import COOKIE

NO_STORE = {"Cache-Control": "private, no-store"}

MODELS = [{
    "id": "layla-1.0",
    "name": "Layla 1.0",
    "name_fa": "لیلا ۱٫۰",
    "description": "Reads Persian text and answers typed questions about it: choose an option, say yes or no, "
                   "or place it on a scale. One fast pass per question.",
    "description_fa": "متن فارسی را می‌خواند و به پرسش‌های شما درباره‌اش پاسخ می‌دهد: انتخاب از میان گزینه‌ها، "
                      "بله یا خیر، یا جایگاه روی یک طیف.",
    "languages": ["fa", "en"],
    "output_types": ["choice", "yes_no", "scale"],
    "max_text_tokens": 512,
    "status": "available",
    "default": True,
}]


# ---- schemas (documented in Swagger) ---------------------------------------------------------------

class AuthConfig(BaseModel):
    google_client_id: str = Field(description="Empty when Google sign-in is not configured.")
    dev_login: bool = Field(description="True only in development: email sign-in without Google.")


class GoogleLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    credential: str = Field(min_length=20, max_length=4096, description="The ID token from Google Identity Services.")


class DevLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    name: str = Field(default="", max_length=200)


class QuotaView(BaseModel):
    limit: int
    used: int
    remaining: int


class AccountOverview(BaseModel):
    user: dict
    quota: QuotaView
    premium: dict
    keys: dict


class UsageDay(BaseModel):
    day: str
    requests: int


class UsageSeries(BaseModel):
    days: list[UsageDay]
    total: int


class KeyView(BaseModel):
    id: int
    name: str
    prefix: str = Field(description="The first characters of the key, for recognising it. The full key is never shown again.")
    created_at: str
    last_used_at: Optional[str]


class KeyList(BaseModel):
    keys: list[KeyView]
    max: int


class KeyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=60, description="Your label for the key, e.g. 'my app'.")


class KeyCreated(BaseModel):
    key: KeyView
    secret: str = Field(description="The full API key. Shown only in this response: store it now.")


class ModelInfo(BaseModel):
    id: str
    name: str
    name_fa: str
    description: str
    description_fa: str
    languages: list[str]
    output_types: list[str]
    max_text_tokens: int
    status: str
    default: bool


class ModelList(BaseModel):
    models: list[ModelInfo]


def build_router(s, accounts, sessions, google, limiter, client_ip, ApiError, ErrorResponse) -> APIRouter:
    r = APIRouter()
    E = {401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}}

    def csrf(request: Request):
        if request.headers.get("x-requested-with") != "layla":
            raise ApiError(403, "csrf", "Send the header `X-Requested-With: layla` with this request.")

    def limited(request: Request):
        wait = limiter.check("auth:" + client_ip(request))
        if wait:
            raise ApiError(429, "rate_limited", f"Too many requests. Try again in {wait} seconds.",
                           {"Retry-After": str(wait)})

    async def current_user(request: Request) -> int:
        uid = sessions.read(request.cookies.get(COOKIE))
        if uid is None or await run_in_threadpool(accounts.get_user, uid) is None:
            raise ApiError(401, "not_signed_in", "Sign in first.")
        request.state.caller = f"user:{uid}"
        return uid

    async def signed_in(request: Request, user, status: int = 200):
        body = await run_in_threadpool(accounts.overview, user.id)
        resp = JSONResponse(body, status_code=status, headers=NO_STORE)
        sessions.set_cookie(resp, sessions.issue(user.id))
        request.state.caller = f"user:{user.id}"
        return resp

    # ---- auth ---------------------------------------------------------------------------------------

    @r.get("/api/v1/auth/config", response_model=AuthConfig, tags=["account"], summary="Sign-in options",
           description="Which sign-in methods this deployment offers. No auth. Cacheable: `public, max-age=300`.")
    def auth_config():
        return JSONResponse({"google_client_id": s.google_client_id, "dev_login": dev_enabled()},
                            headers={"Cache-Control": "public, max-age=300"})

    def dev_enabled() -> bool:
        return s.dev_login and s.environment != "production"

    @r.post("/api/v1/auth/google", response_model=AccountOverview, tags=["account"], summary="Sign in with Google",
            description="Verifies a Google ID token, creates the account on first sign-in (with the free request "
                        "quota) and sets the session cookie. Requires `X-Requested-With: layla`. Not cacheable.",
            responses={**E, 400: {"model": ErrorResponse}, 429: {"model": ErrorResponse}, 503: {"model": ErrorResponse}})
    async def login_google(request: Request, body: GoogleLogin):
        csrf(request); limited(request)
        if not s.google_client_id:
            raise ApiError(503, "google_not_configured", "Google sign-in is not set up on this server.")
        try:
            g = await run_in_threadpool(google, body.credential)
        except ValueError as e:
            raise ApiError(400, "invalid_credential", str(e))
        user = await run_in_threadpool(accounts.sign_in, g["email"], g["name"], g["picture"], g["sub"])
        return await signed_in(request, user)

    @r.post("/api/v1/auth/dev", response_model=AccountOverview, tags=["account"],
            summary="Development sign-in (no Google)",
            description="Only when `LAYLA_DEV_LOGIN=1` and the environment is not production; otherwise 404. "
                        "Requires `X-Requested-With: layla`.", responses={**E, 404: {"model": ErrorResponse}})
    async def login_dev(request: Request, body: DevLogin):
        if not dev_enabled():
            raise ApiError(404, "not_found", "Not found.")
        csrf(request); limited(request)
        user = await run_in_threadpool(accounts.sign_in, body.email, body.name)
        return await signed_in(request, user)

    @r.post("/api/v1/auth/logout", status_code=204, tags=["account"], summary="Sign out",
            description="Clears the session cookie. Requires `X-Requested-With: layla`.", responses=E)
    def logout(request: Request):
        csrf(request)
        resp = Response(status_code=204, headers=NO_STORE)
        sessions.clear_cookie(resp)
        return resp

    # ---- account ------------------------------------------------------------------------------------

    @r.get("/api/v1/account", response_model=AccountOverview, tags=["account"], summary="Account overview",
           description="The signed-in user's profile, free request quota, premium status and key count. "
                       "Auth: session cookie. Not cacheable (`private, no-store`).", responses=E)
    async def account(uid: int = Depends(current_user)):
        return JSONResponse(await run_in_threadpool(accounts.overview, uid), headers=NO_STORE)

    @r.get("/api/v1/account/usage", response_model=UsageSeries, tags=["account"], summary="Daily usage",
           description="Requests made with the user's API keys, per day, for the last `days` days (1-90, "
                       "default 30), oldest first, every day present (zero when unused). Bounded by `days`, so "
                       "not paginated. Auth: session cookie. Not cacheable.", responses=E)
    async def usage(days: int = Query(30, ge=1, le=90), uid: int = Depends(current_user)):
        return JSONResponse(await run_in_threadpool(accounts.usage, uid, days), headers=NO_STORE)

    # ---- keys ---------------------------------------------------------------------------------------

    @r.get("/api/v1/keys", response_model=KeyList, tags=["keys"], summary="List your API keys",
           description=f"Active keys of the signed-in user, newest first. At most `LAYLA_MAX_KEYS` ({s.max_keys}) "
                       "exist per user, so the list is not paginated. Secrets are never returned. "
                       "Auth: session cookie. Not cacheable.", responses=E)
    async def list_keys(uid: int = Depends(current_user)):
        return JSONResponse({"keys": await run_in_threadpool(accounts.list_keys, uid), "max": s.max_keys},
                            headers=NO_STORE)

    @r.post("/api/v1/keys", status_code=201, response_model=KeyCreated, tags=["keys"], summary="Create an API key",
            description="Creates a key for the signed-in user. The full secret is in this response only. "
                        "409 `key_limit` when the user already has the maximum. Requires `X-Requested-With: layla`.",
            responses={**E, 409: {"model": ErrorResponse}})
    async def create_key(request: Request, body: KeyCreate, uid: int = Depends(current_user)):
        csrf(request)
        made = await run_in_threadpool(accounts.create_key, uid, body.name.strip())
        if made is None:
            raise ApiError(409, "key_limit", f"You can have at most {s.max_keys} keys. Revoke one first.")
        view, secret = made
        return JSONResponse({"key": view, "secret": secret}, status_code=201, headers=NO_STORE)

    @r.delete("/api/v1/keys/{key_id}", status_code=204, tags=["keys"], summary="Revoke an API key",
              description="Revokes one of the signed-in user's keys; requests with it get 401 from then on. "
                          "A key that is not yours answers 404, exactly like a missing one. "
                          "Requires `X-Requested-With: layla`. Idempotent in effect.",
              responses={**E, 404: {"model": ErrorResponse}})
    async def revoke_key(request: Request, key_id: int, uid: int = Depends(current_user)):
        csrf(request)
        if not await run_in_threadpool(accounts.revoke_key, uid, key_id):
            raise ApiError(404, "not_found", "No such key.")
        return Response(status_code=204, headers=NO_STORE)

    # ---- models -------------------------------------------------------------------------------------

    @r.get("/api/v1/models", response_model=ModelList, tags=["decisions"], summary="Available models",
           description="The models this API serves. No auth. Cacheable: `public, max-age=300` (changes only "
                       "with a release). Naturally bounded, not paginated.")
    def models():
        return JSONResponse({"models": MODELS}, headers={"Cache-Control": "public, max-age=300"})

    return r
