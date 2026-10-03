"""Unit tests for answer shaping, the cache and the preset catalog."""
from app.catalog import PRESETS
from app.engine import Cache
from app.main import to_result
from app.schemas import OutputSpec


def test_yes_no_result_reports_probability_of_its_answer():
    r = to_result("x", {}, {"type": "noul", "noul": 0.2, "confidence": 0.6}, 5.0, False)
    assert r["answer"] == "no" and r["label"] == "خیر" and r["probability"] == 0.8
    assert r["options"][0] == {"key": "yes", "label": "بله", "probability": 0.2}


def test_scale_result_uses_level_labels():
    ans = {"type": "score", "score": 1.7, "probabilities": {"0": 0.1, "1": 0.2, "2": 0.7}, "confidence": 0.5}
    r = to_result("x", {"0": "کم", "1": "متوسط", "2": "زیاد"}, ans, 1.0, True)
    assert r["type"] == "scale" and r["answer"] == "2" and r["label"] == "زیاد" and r["level"] == 1.7


def test_preset_display_labels_override_internal_keys():
    q, labels = OutputSpec(id="o", preset="offensive").to_question()
    assert list(q["criteria"]) == ["A", "B"] and labels == {"A": "توهین ندارد", "B": "توهین دارد"}


def test_cache_evicts_oldest():
    c = Cache(2)
    c.put("a", 1); c.put("b", 2); c.get("a"); c.put("c", 3)
    assert c.get("b") is None and c.get("a") == 1 and c.get("c") == 3


def test_every_preset_is_a_valid_laya_question():
    """Integration: runs only where the laya package is installed (the service image, the dev venv)."""
    import pytest
    laya = pytest.importorskip("laya")
    for pid, p in PRESETS.items():
        laya.Agent._check_question(pid, p["question"])


def test_env_example_has_no_comment_after_an_empty_value():
    """Regression: compose reads `KEY=   # note` as the value '# note' (it set a bogus Google client id on staging)."""
    import os, re
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.example")
    bad = [l for l in open(path, encoding="utf-8") if re.match(r"^[A-Z_]+=\s+#", l)]
    assert not bad, bad
