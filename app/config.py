"""All configuration comes from environment variables (see .env.example)."""
import os
from dataclasses import dataclass, field


def _int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


def _bool(name: str, default: bool) -> bool:
    return os.environ.get(name, "1" if default else "0").strip().lower() in ("1", "true", "yes", "on")


def _keys(raw: str) -> dict:
    """`name:secret,name2:secret2` -> {secret: name}. Names are what the logs show; secrets are never logged."""
    out = {}
    for part in filter(None, (p.strip() for p in raw.split(","))):
        name, _, secret = part.partition(":")
        if not secret:
            name, secret = "key", name
        out[secret] = name
    return out


@dataclass(frozen=True)
class Settings:
    version: str = os.environ.get("LAYLA_VERSION", "dev")
    git_sha: str = os.environ.get("LAYLA_GIT_SHA", "unknown")
    environment: str = os.environ.get("LAYLA_ENV", "development")

    engine: str = os.environ.get("LAYLA_ENGINE", "laya")  # laya | fake (tests, UI work)
    model_path: str = os.environ.get("LAYLA_MODEL_PATH", "/models/layla-1.0")
    model_name: str = os.environ.get("LAYLA_MODEL_NAME", "layla-1.0")
    device: str = os.environ.get("LAYLA_DEVICE", "cpu")
    threads: int = _int("LAYLA_THREADS", 4)
    quant: str = os.environ.get("LAYLA_QUANT", "none")  # none | int8
    max_text_tokens: int = _int("LAYLA_MAX_TEXT_TOKENS", 512)
    cache_size: int = _int("LAYLA_CACHE_SIZE", 2048)

    api_keys: dict = field(default_factory=lambda: _keys(os.environ.get("LAYLA_API_KEYS", "")))
    public_demo: bool = _bool("LAYLA_PUBLIC_DEMO", False)
    trust_proxy: bool = _bool("LAYLA_TRUST_PROXY", False)
    anon_rate_per_min: int = _int("LAYLA_ANON_RATE_PER_MIN", 30)
    anon_max_chars: int = _int("LAYLA_ANON_MAX_CHARS", 4000)
    anon_max_outputs: int = _int("LAYLA_ANON_MAX_OUTPUTS", 6)
    max_chars: int = _int("LAYLA_MAX_CHARS", 20000)
    max_outputs: int = _int("LAYLA_MAX_OUTPUTS", 12)

    # accounts (sign-in, user API keys, free quota)
    database_url: str = os.environ.get("LAYLA_DATABASE_URL", "sqlite:///./layla.db")
    auto_migrate: bool = _bool("LAYLA_AUTO_MIGRATE", True)
    session_secret: str = os.environ.get("LAYLA_SESSION_SECRET", "")
    session_days: int = _int("LAYLA_SESSION_DAYS", 14)
    cookie_secure: bool = _bool("LAYLA_COOKIE_SECURE", False)
    google_client_id: str = os.environ.get("LAYLA_GOOGLE_CLIENT_ID", "")
    dev_login: bool = _bool("LAYLA_DEV_LOGIN", False)
    free_requests: int = _int("LAYLA_FREE_REQUESTS", 100)
    max_keys: int = _int("LAYLA_MAX_KEYS", 5)

    max_inflight: int = _int("LAYLA_MAX_INFLIGHT", 12)
    request_timeout_s: int = _int("LAYLA_REQUEST_TIMEOUT_S", 30)
    serve_web: bool = _bool("LAYLA_SERVE_WEB", True)
    cors_origins: tuple = tuple(filter(None, os.environ.get("LAYLA_CORS_ORIGINS", "").split(",")))


def load() -> Settings:
    return Settings()
