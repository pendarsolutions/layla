"""HTTP contract tests. They run against the deterministic FakeEngine, so they need no model and no GPU."""
import dataclasses
import json
import logging
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from app import config
from app.engine import FakeEngine
from app.main import create_app

KEY = "test-secret-123"
TEXT = "سفارشم سه روز پیش ثبت شد و هنوز نرسیده. لطفاً پولم را برگردانید."
OUTPUTS = [
    {"id": "tone", "preset": "sentiment"},
    {"id": "urgency", "preset": "urgency"},
    {"id": "refund", "type": "yes_no", "question": "آیا مشتری پولش را پس می‌خواهد؟"},
    {"id": "team", "type": "choice", "question": "به کدام واحد مربوط است؟", "options": ["فروش", "پشتیبانی", "مالی"]},
    {"id": "stars", "type": "scale", "question": "چند ستاره؟", "options": ["یک", "دو", "سه"]},
]


def make(**over):
    db = os.path.join(tempfile.mkdtemp(), "t.db")
    base = dict(engine="fake", api_keys={KEY: "tester"}, public_demo=False, serve_web=False,
                anon_rate_per_min=3, anon_max_chars=200, anon_max_outputs=2, max_inflight=4,
                database_url=f"sqlite:///{db}", session_secret="x" * 40)
    base.update(over)
    s = dataclasses.replace(config.Settings(), **base)
    return TestClient(create_app(s, engine=FakeEngine(s)))


AUTH = {"Authorization": f"Bearer {KEY}"}


@pytest.fixture
def client():
    with make() as c:
        yield c


@pytest.fixture
def demo():
    with make(public_demo=True) as c:
        yield c


# ---- operations ---------------------------------------------------------------------------------

def test_health_and_ready(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"
    assert r.headers["cache-control"] == "no-store"
    r = client.get("/ready")
    assert r.status_code == 200 and r.json()["engine"] == "fake"


def test_outputs_catalog_is_public_and_cacheable(client):
    r = client.get("/api/v1/outputs")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "public, max-age=300"
    ids = {o["id"] for o in r.json()["outputs"]}
    assert {"sentiment", "urgency", "star_rating"} <= ids
    assert all(o["type"] in ("choice", "yes_no", "scale") for o in r.json()["outputs"])


def test_request_id_is_echoed(client):
    r = client.get("/health", headers={"X-Request-ID": "abc123"})
    assert r.headers["x-request-id"] == "abc123"


# ---- decisions: success -------------------------------------------------------------------------

def test_decisions_success_shape_and_order(client):
    r = client.post("/api/v1/decisions", json={"text": TEXT, "outputs": OUTPUTS}, headers=AUTH)
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "no-store"
    body = r.json()
    assert [x["id"] for x in body["results"]] == [o["id"] for o in OUTPUTS]
    by = {x["id"]: x for x in body["results"]}
    assert by["refund"]["type"] == "yes_no" and by["refund"]["answer"] in ("yes", "no")
    assert by["team"]["answer"] in ("فروش", "پشتیبانی", "مالی")
    assert by["stars"]["type"] == "scale" and by["stars"]["level"] is not None
    assert by["tone"]["label"] in ("مثبت", "منفی", "خنثی", "دوگانه")
    for x in body["results"]:
        assert abs(sum(o["probability"] for o in x["options"]) - 1) < 0.01
    assert body["truncated"] is False


def test_same_request_twice_is_cached_and_identical(client):
    payload = {"text": TEXT, "outputs": OUTPUTS[:2]}
    a = client.post("/api/v1/decisions", json=payload, headers=AUTH).json()
    b = client.post("/api/v1/decisions", json=payload, headers=AUTH).json()
    assert [x["answer"] for x in a["results"]] == [x["answer"] for x in b["results"]]
    assert all(x["cached"] for x in b["results"])


def test_stream_events_in_order(client):
    with client.stream("POST", "/api/v1/decisions/stream", json={"text": TEXT, "outputs": OUTPUTS},
                       headers=AUTH) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/x-ndjson")
        events = [json.loads(line) for line in r.iter_lines() if line]
    assert events[0]["event"] == "start" and events[0]["outputs"] == [o["id"] for o in OUTPUTS]
    assert [e["result"]["id"] for e in events[1:-1]] == [o["id"] for o in OUTPUTS]
    assert events[-1]["event"] == "done"


def test_long_text_is_truncated_not_rejected():
    with make(max_text_tokens=10) as c:
        r = c.post("/api/v1/decisions", json={"text": "کلمه " * 50, "outputs": OUTPUTS[:1]}, headers=AUTH)
        assert r.status_code == 200 and r.json()["truncated"] is True


# ---- decisions: invalid input -------------------------------------------------------------------

@pytest.mark.parametrize("payload,fragment", [
    ({"text": TEXT, "outputs": []}, "outputs"),
    ({"text": "   ", "outputs": OUTPUTS[:1]}, "empty"),
    ({"text": TEXT, "outputs": [{"id": "x", "preset": "nope"}]}, "unknown preset"),
    ({"text": TEXT, "outputs": [{"id": "x", "type": "choice", "question": "کدام؟", "options": ["یک"]}]}, "2 to 12"),
    ({"text": TEXT, "outputs": [{"id": "x", "type": "yes_no", "question": "آیا؟", "options": ["a", "b"]}]}, "no options"),
    ({"text": TEXT, "outputs": [{"id": "x", "type": "scale", "question": "چقدر؟", "options": {"a": "b", "c": "d"}}]}, "list"),
    ({"text": TEXT, "outputs": [{"id": "a", "preset": "sentiment"}, {"id": "a", "preset": "urgency"}]}, "unique"),
    ({"text": TEXT, "outputs": [{"id": "bad id!", "preset": "sentiment"}]}, "id"),
    ({"text": TEXT, "outputs": [{"id": "x", "preset": "sentiment", "question": "چرا؟"}]}, "not both"),
    ({"text": TEXT, "outputs": OUTPUTS[:1], "user_id": 5}, "extra"),
])
def test_invalid_input_is_422_with_error_schema(client, payload, fragment):
    r = client.post("/api/v1/decisions", json=payload, headers=AUTH)
    assert r.status_code == 422, r.text
    err = r.json()["error"]
    assert err["code"] == "invalid_request" and fragment.lower() in err["message"].lower()
    assert err["request_id"]


# ---- authentication / limits --------------------------------------------------------------------

def test_missing_key_is_401_when_demo_is_off(client):
    r = client.post("/api/v1/decisions", json={"text": TEXT, "outputs": OUTPUTS[:1]})
    assert r.status_code == 401 and r.json()["error"]["code"] == "missing_key"
    assert r.headers["www-authenticate"] == "Bearer"


def test_invalid_key_is_401_even_when_demo_is_on(demo):
    r = demo.post("/api/v1/decisions", json={"text": TEXT, "outputs": OUTPUTS[:1]},
                  headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_key"


def test_anonymous_allowed_in_demo_with_lower_limits(demo):
    assert demo.post("/api/v1/decisions", json={"text": TEXT, "outputs": OUTPUTS[:2]}).status_code == 200
    r = demo.post("/api/v1/decisions", json={"text": TEXT, "outputs": OUTPUTS[:3]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "too_many_outputs"
    r = demo.post("/api/v1/decisions", json={"text": "ا" * 300, "outputs": OUTPUTS[:1]})
    assert r.status_code == 413
    # the key tier keeps its own, higher limits
    assert demo.post("/api/v1/decisions", json={"text": TEXT, "outputs": OUTPUTS}, headers=AUTH).status_code == 200


def test_anonymous_rate_limit_is_429_with_retry_after(demo):
    for _ in range(3):
        demo.post("/api/v1/decisions", json={"text": TEXT, "outputs": OUTPUTS[:1]})
    r = demo.post("/api/v1/decisions", json={"text": TEXT, "outputs": OUTPUTS[:1]})
    assert r.status_code == 429 and int(r.headers["retry-after"]) > 0
    # keys are not rate limited per IP
    assert demo.post("/api/v1/decisions", json={"text": TEXT, "outputs": OUTPUTS[:1]}, headers=AUTH).status_code == 200


def test_busy_is_503_with_retry_after():
    with make(max_inflight=0) as c:
        r = c.post("/api/v1/decisions", json={"text": TEXT, "outputs": OUTPUTS[:1]}, headers=AUTH)
        assert r.status_code == 503 and r.headers["retry-after"] == "2"


# ---- logging ------------------------------------------------------------------------------------

def test_logs_have_request_context_but_no_text_or_key(client, caplog):
    logger = logging.getLogger("layla")
    logger.addHandler(caplog.handler)
    try:
        client.post("/api/v1/decisions", json={"text": TEXT, "outputs": OUTPUTS[:1]}, headers=AUTH)
    finally:
        logger.removeHandler(caplog.handler)
    lines = [json.loads(r.getMessage()) for r in caplog.records if r.getMessage().startswith("{")]
    entry = next(x for x in lines if x.get("path") == "/api/v1/decisions")
    assert entry["caller"] == "tester" and entry["status"] == 200 and entry["request_id"]
    joined = json.dumps(lines, ensure_ascii=False)
    assert TEXT not in joined and KEY not in joined
