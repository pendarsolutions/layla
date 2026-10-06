"""Traffic statistics: requests per day by channel, anonymous visitors, users, the admin endpoint, the daily log."""
import json
import logging
from datetime import timedelta

from app import traffic as traffic_mod
from tests.test_accounts import H, ONE, signed_in
from tests.test_api import AUTH, make

ADMIN = {"Authorization": "Bearer admin-token-xyz"}


def stats(c, days=1):
    r = c.get(f"/api/v1/admin/stats?days={days}", headers=ADMIN)
    assert r.status_code == 200, r.text
    return r.json()


def test_admin_stats_is_off_without_a_token_and_needs_the_right_one():
    with make() as c:
        assert c.get("/api/v1/admin/stats", headers=ADMIN).status_code == 404
    with make(admin_token="admin-token-xyz") as c:
        assert c.get("/api/v1/admin/stats").status_code == 401
        assert c.get("/api/v1/admin/stats", headers={"Authorization": "Bearer nope"}).status_code == 401
        assert c.get("/api/v1/admin/stats", headers=AUTH).status_code == 401  # an operator key is not admin
        r = c.get("/api/v1/admin/stats", headers=ADMIN)
        assert r.status_code == 200 and r.headers["cache-control"] == "no-store"


def test_requests_are_counted_per_channel_and_users_per_day():
    with make(admin_token="admin-token-xyz", public_demo=True, dev_login=True, free_requests=5,
              anon_rate_per_min=50) as c:
        for _ in range(3):
            assert c.post("/api/v1/decisions", json=ONE).status_code == 200                      # anonymous
        assert c.post("/api/v1/decisions/stream", json=ONE).status_code == 200                   # anonymous, stream
        assert c.post("/api/v1/decisions", json=ONE, headers=AUTH).status_code == 200            # operator key
        signed_in(c)
        secret = c.post("/api/v1/keys", json={"name": "app"}, headers=H).json()["secret"]
        for _ in range(2):
            assert c.post("/api/v1/decisions", json=ONE, headers={"Authorization": f"Bearer {secret}"}).status_code == 200
        day = stats(c)["days"][-1]
        assert day["requests"] == 7 and day["failed"] == 0 and day["outputs"] == 7
        assert day["by_channel"] == {"anonymous": 4, "user_key": 2, "operator_key": 1}
        assert day["anonymous_visitors"] == 1        # the same IP all day
        assert day["active_users"] == 1 and day["new_users"] == 1
        rep = stats(c, 7)
        assert len(rep["days"]) == 7 and rep["users"] == {"total": 1, "with_keys": 1}


def test_rejected_requests_are_not_counted():
    with make(admin_token="admin-token-xyz") as c:
        assert c.post("/api/v1/decisions", json=ONE).status_code == 401
        assert stats(c)["days"][-1]["requests"] == 0


def test_visitors_are_hashed_and_rotate_daily(tmp_path):
    t = traffic_mod.Traffic(None, "secret")
    d = traffic_mod.utcnow().date()
    a, b = t.visitor("1.2.3.4", d), t.visitor("1.2.3.4", d + timedelta(days=1))
    assert a != b and "1.2.3.4" not in a and len(a) == 20


def test_a_finished_day_is_logged_once(monkeypatch, caplog):
    with make(admin_token="admin-token-xyz", public_demo=True) as c:
        assert c.post("/api/v1/decisions", json=ONE).status_code == 200
        t = c.app.state.traffic
        tomorrow = traffic_mod.utcnow() + timedelta(days=1)
        monkeypatch.setattr(traffic_mod, "utcnow", lambda: tomorrow)
        lines = []
        handler = logging.Handler(); handler.emit = lambda r: lines.append(r.getMessage())
        logging.getLogger("layla").addHandler(handler)
        try:
            t.tick(); t.tick()
        finally:
            logging.getLogger("layla").removeHandler(handler)
        daily = [json.loads(x) for x in lines if '"daily_stats"' in x]
        assert len(daily) == 1 and daily[0]["requests"] == 1 and daily[0]["by_channel"]["anonymous"] == 1
