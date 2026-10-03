"""The model behind the API. One question = one forward pass, run one at a time on a single worker thread.

On CPU a batch of N questions costs N times one question, so answering them one by one costs the same in
total and lets the first answer leave after 1/N of the time. That is what makes streaming honest.
"""
import hashlib
import json
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor


class Cache:
    """Small in-process LRU of finished answers. A speed-up only: nothing breaks when it is empty or lost."""

    def __init__(self, size: int):
        self.size, self.data, self.lock = size, OrderedDict(), threading.Lock()

    @staticmethod
    def key(text: str, question: dict) -> str:
        raw = text + "\x00" + json.dumps(question, ensure_ascii=False)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def get(self, key):
        with self.lock:
            if key in self.data:
                self.data.move_to_end(key)
                return self.data[key]
        return None

    def put(self, key, value):
        if self.size <= 0:
            return
        with self.lock:
            self.data[key] = value
            self.data.move_to_end(key)
            while len(self.data) > self.size:
                self.data.popitem(last=False)


class LayaEngine:
    name = "laya"

    def __init__(self, settings):
        import torch
        import laya

        torch.set_num_threads(max(1, settings.threads))
        torch.set_num_interop_threads(1)
        self.torch = torch
        self.agent = laya.Agent(settings.model_path, device=settings.device)
        self.agent.model.eval()
        cfg = self.agent.cfg
        self.budget = min(settings.max_text_tokens, cfg.get("max_len", 1024) - cfg.get("head_max_len", 128) - 30)
        self.answer("سلام", {"type": "choice", "instructions": "لحن؟", "criteria": {"مثبت": "مثبت", "منفی": "منفی"}})

    def fit(self, text: str):
        """Keep long text inside the token budget: the head and the tail, with an ellipsis between."""
        tok = self.agent.tok
        ids = tok(text, add_special_tokens=False)["input_ids"]
        if len(ids) <= self.budget:
            return text, False
        head = int(self.budget * 0.45)
        return tok.decode(ids[:head]) + " … " + tok.decode(ids[-(self.budget - head):]), True

    def check(self, qid: str, question: dict):
        self.agent._check_question(qid, question)

    def answer(self, text: str, question: dict):
        with self.torch.inference_mode():
            res = self.agent.predict(text, {"q": question})
        return res["answers"]["q"], int(res.get("usage", {}).get("input_tokens", 0))


class FakeEngine:
    """Deterministic stand-in with the same interface. Used by the test suite and for UI work without a model."""
    name = "fake"

    def __init__(self, settings, delay_s: float = 0.0):
        self.budget, self.delay_s = settings.max_text_tokens, delay_s

    def fit(self, text: str):
        words = text.split()
        if len(words) <= self.budget:
            return text, False
        head = int(self.budget * 0.45)
        return " ".join(words[:head]) + " … " + " ".join(words[-(self.budget - head):]), True

    def check(self, qid: str, question: dict):
        return None

    def answer(self, text: str, question: dict):
        if self.delay_s:
            time.sleep(self.delay_s)
        h = int(hashlib.sha256((text + json.dumps(question, ensure_ascii=False)).encode()).hexdigest(), 16)
        t, crit = question["type"], question.get("criteria")
        n = len(text.split())
        if t == "noul":
            p = (h % 1000) / 1000
            return {"type": "noul", "noul": p, "confidence": round(abs(p - 0.5) * 2, 4)}, n
        keys = list(crit) if isinstance(crit, dict) else [str(i) for i in range(len(crit))]
        raw = [((h >> (8 * i)) % 97) + 1 for i in range(len(keys))]
        probs = {k: round(v / sum(raw), 4) for k, v in zip(keys, raw)}
        top = max(probs, key=probs.get)
        if t == "choice":
            return {"type": "choice", "choice": top, "probabilities": probs, "confidence": probs[top]}, n
        level = sum(int(k) * v for k, v in probs.items())
        return {"type": "score", "score": round(level, 4), "probabilities": probs, "confidence": probs[top]}, n


class Runner:
    """Serialises model calls on one thread (the CPU budget is set by threads, not by parallel calls)."""

    def __init__(self, engine, cache_size: int):
        self.engine, self.cache = engine, Cache(cache_size)
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="layla-infer")

    def _run(self, text: str, question: dict):
        key = Cache.key(text, question)
        hit = self.cache.get(key)
        if hit is not None:
            return hit[0], hit[1], 0.0, True
        t = time.perf_counter()
        ans, tokens = self.engine.answer(text, question)
        ms = (time.perf_counter() - t) * 1000
        self.cache.put(key, (ans, tokens))
        return ans, tokens, ms, False

    def submit(self, text: str, question: dict):
        return self.pool.submit(self._run, text, question)


def build(settings):
    if settings.engine == "fake":
        import os
        return FakeEngine(settings, delay_s=float(os.environ.get("LAYLA_FAKE_DELAY_MS", "0")) / 1000)
    return LayaEngine(settings)
