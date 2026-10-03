"""Accounts: sign-in, sessions, CSRF, API keys, the free quota, usage, models, migrations."""
import os
import tempfile

import pytest

from tests.test_api import KEY, OUTPUTS, TEXT, make

H = {"X-Requested-With": "layla"}
ONE = {"text": TEXT, "outputs": OUTPUTS[:1]}


def signed_in(client, email="ali@example.com"):
    r = client.post("/api/v1/auth/dev", json={"email": email, "name": "Ali"}, headers=H)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def dev():
    with make(dev_login=True, free_requests=3) as c:
        yield c


# ---- sign-in and sessions -----------------------------------------------------------------------

def test_auth_config_is_public_and_cacheable(dev):
    r = dev.get("/api/v1/auth/config")
    assert r.status_code == 200 and r.json() == {"google_client_id": "", "dev_login": True}
    assert r.headers["cache-control"] == "public, max-age=300"


def test_dev_login_creates_account_with_free_quota_and_session_cookie(dev):
    body = signed_in(dev)
    assert body["quota"] == {"limit": 3, "used": 0, "remaining": 3}
    assert body["premium"]["available"] is False
    assert "layla_session" in dev.cookies
    r = dev.get("/api/v1/account")
    assert r.status_code == 200 and r.json()["user"]["email"] == "ali@example.com"
    assert r.headers["cache-control"] == "private, no-store"


def test_dev_login_is_off_by_default_and_in_production():
    with make() as c:
        assert c.post("/api/v1/auth/dev", json={"email": "a@b.co"}, headers=H).status_code == 404
    with make(dev_login=True, environment="production", session_secret="y" * 40) as c:
        assert c.post("/api/v1/auth/dev", json={"email": "a@b.co"}, headers=H).status_code == 404


def test_cookie_changes_need_the_csrf_header(dev):
    r = dev.post("/api/v1/auth/dev", json={"email": "a@b.co"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf"
    signed_in(dev)
    assert dev.post("/api/v1/keys", json={"name": "app"}).status_code == 403


def test_account_endpoints_need_a_session(dev):
    for path in ("/api/v1/account", "/api/v1/account/usage", "/api/v1/keys"):
        r = dev.get(path)
        assert r.status_code == 401 and r.json()["error"]["code"] == "not_signed_in"
    dev.cookies.set("layla_session", "forged.token.value")
    assert dev.get("/api/v1/account").status_code == 401


def test_logout_clears_the_session(dev):
    signed_in(dev)
    assert dev.post("/api/v1/auth/logout", headers=H).status_code == 204
    assert dev.get("/api/v1/account").status_code == 401


def test_google_sign_in_with_a_verified_token():
    calls = []

    def fake_google(credential):
        calls.append(credential)
        if credential != "g" * 30:
            raise ValueError("invalid Google token")
        return {"sub": "1234", "email": "Sara@Example.com", "name": "Sara", "picture": "https://x/p.png"}

    import dataclasses
    from fastapi.testclient import TestClient
    from app import config
    from app.engine import FakeEngine
    from app.main import create_app
    db = os.path.join(tempfile.mkdtemp(), "g.db")
    st = dataclasses.replace(config.Settings(), engine="fake", serve_web=False, database_url=f"sqlite:///{db}",
                             session_secret="z" * 40, google_client_id="client-1.apps.googleusercontent.com")
    with TestClient(create_app(st, engine=FakeEngine(st), google=fake_google)) as c:
        bad = c.post("/api/v1/auth/google", json={"credential": "b" * 30}, headers=H)
        assert bad.status_code == 400 and bad.json()["error"]["code"] == "invalid_credential"
        ok = c.post("/api/v1/auth/google", json={"credential": "g" * 30}, headers=H)
        assert ok.status_code == 200 and ok.json()["user"]["email"] == "sara@example.com"
        # signing in again finds the same account
        again = c.post("/api/v1/auth/google", json={"credential": "g" * 30}, headers=H)
        assert again.json()["user"]["member_since"] == ok.json()["user"]["member_since"]


def test_google_not_configured_is_503(dev):
    r = dev.post("/api/v1/auth/google", json={"credential": "g" * 30}, headers=H)
    assert r.status_code == 503 and r.json()["error"]["code"] == "google_not_configured"


# ---- keys ---------------------------------------------------------------------------------------

def test_create_list_and_revoke_keys(dev):
    signed_in(dev)
    r = dev.post("/api/v1/keys", json={"name": "my app"}, headers=H)
    assert r.status_code == 201
    secret, key = r.json()["secret"], r.json()["key"]
    assert secret.startswith("lyl_") and len(secret) > 40 and secret.startswith(key["prefix"])
    listed = dev.get("/api/v1/keys").json()
    assert listed["max"] == 5 and [k["id"] for k in listed["keys"]] == [key["id"]]
    assert secret not in dev.get("/api/v1/keys").text
    assert dev.delete(f"/api/v1/keys/{key['id']}", headers=H).status_code == 204
    assert dev.get("/api/v1/keys").json()["keys"] == []
    assert dev.delete(f"/api/v1/keys/{key['id']}", headers=H).status_code == 404


def test_key_limit_is_409(dev):
    signed_in(dev)
    for i in range(5):
        assert dev.post("/api/v1/keys", json={"name": f"k{i}"}, headers=H).status_code == 201
    r = dev.post("/api/v1/keys", json={"name": "one too many"}, headers=H)
    assert r.status_code == 409 and r.json()["error"]["code"] == "key_limit"


def test_someone_elses_key_is_not_found(dev):
    signed_in(dev, "a@example.com")
    kid = dev.post("/api/v1/keys", json={"name": "a"}, headers=H).json()["key"]["id"]
    signed_in(dev, "b@example.com")
    assert dev.delete(f"/api/v1/keys/{kid}", headers=H).status_code == 404


# ---- the free quota -------------------------------------------------------------------------------

def test_user_key_spends_quota_records_usage_then_402(dev):
    signed_in(dev)
    secret = dev.post("/api/v1/keys", json={"name": "app"}, headers=H).json()["secret"]
    auth = {"Authorization": f"Bearer {secret}"}
    for _ in range(3):
        assert dev.post("/api/v1/decisions", json=ONE, headers=auth).status_code == 200
    r = dev.post("/api/v1/decisions", json=ONE, headers=auth)
    assert r.status_code == 402 and r.json()["error"]["code"] == "quota_exhausted"
    assert "Premium" in r.json()["error"]["message"]
    acct = dev.get("/api/v1/account").json()
    assert acct["quota"] == {"limit": 3, "used": 3, "remaining": 0}
    usage = dev.get("/api/v1/account/usage?days=7").json()
    assert len(usage["days"]) == 7 and usage["total"] == 3 and usage["days"][-1]["requests"] == 3
    assert dev.get("/api/v1/keys").json()["keys"][0]["last_used_at"] is not None


def test_stream_with_user_key_counts_once(dev):
    signed_in(dev)
    secret = dev.post("/api/v1/keys", json={"name": "app"}, headers=H).json()["secret"]
    with dev.stream("POST", "/api/v1/decisions/stream", json={"text": TEXT, "outputs": OUTPUTS},
                    headers={"Authorization": f"Bearer {secret}"}) as r:
        assert r.status_code == 200
        list(r.iter_lines())
    assert dev.get("/api/v1/account").json()["quota"]["used"] == 1


def test_failed_request_is_refunded():
    with make(dev_login=True, request_timeout_s=0) as c:
        signed_in(c)
        secret = c.post("/api/v1/keys", json={"name": "app"}, headers=H).json()["secret"]
        r = c.post("/api/v1/decisions", json=ONE, headers={"Authorization": f"Bearer {secret}"})
        assert r.status_code == 504
        assert c.get("/api/v1/account").json()["quota"]["used"] == 0


def test_revoked_key_is_401_and_operator_keys_have_no_quota(dev):
    signed_in(dev)
    made = dev.post("/api/v1/keys", json={"name": "app"}, headers=H).json()
    dev.delete(f"/api/v1/keys/{made['key']['id']}", headers=H)
    r = dev.post("/api/v1/decisions", json=ONE, headers={"Authorization": f"Bearer {made['secret']}"})
    assert r.status_code == 401
    for _ in range(5):  # more than the 3 free requests
        assert dev.post("/api/v1/decisions", json=ONE, headers={"Authorization": f"Bearer {KEY}"}).status_code == 200


@pytest.mark.parametrize("days", [0, 91])
def test_usage_days_are_bounded(dev, days):
    signed_in(dev)
    assert dev.get(f"/api/v1/account/usage?days={days}").status_code == 422


# ---- models and migrations ----------------------------------------------------------------------

def test_models_list_is_public_and_cacheable(dev):
    r = dev.get("/api/v1/models")
    assert r.status_code == 200 and r.headers["cache-control"] == "public, max-age=300"
    assert [m["id"] for m in r.json()["models"]] == ["layla-1.0"]


def test_migrations_upgrade_downgrade_upgrade():
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, inspect
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    url = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "m.db")
    cfg = Config(os.path.join(root, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(root, "migrations"))
    cfg.attributes["connection_url"] = url
    command.upgrade(cfg, "head")
    assert {"users", "api_keys", "usage_daily"} <= set(inspect(create_engine(url)).get_table_names())
    command.downgrade(cfg, "base")
    assert not {"users", "api_keys"} & set(inspect(create_engine(url)).get_table_names())
    command.upgrade(cfg, "head")
