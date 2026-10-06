"""Traffic: how many requests and how many people, per day.

Every decision request is counted by channel (anonymous playground, a user's key, an operator key) and outcome.
Anonymous visitors are counted by a daily-rotating hash of their IP (sha256 of a server secret, the day and the IP),
so a visitor is counted once a day and no IP is ever stored. Signed-in users are counted from `usage_daily`.

Counting happens in memory and is flushed to the database every `flush_s` seconds (and at shutdown), so a request
never waits on a write. When a UTC day ends, one `daily_stats` line with that day's numbers goes to the log.
"""
import hashlib
import json
import logging
import threading
from collections import Counter
from datetime import date, datetime, timedelta

from sqlalchemy import distinct, func, select

from .db import ApiKey, Database, TrafficDaily, UsageDaily, User, VisitorDaily, utcnow

CHANNELS = ("anonymous", "user_key", "operator_key")
log = logging.getLogger("layla")


class Traffic:
    def __init__(self, db: Database, secret: str, flush_s: int = 60):
        self.db, self.secret, self.flush_s = db, secret.encode(), flush_s
        self.lock = threading.Lock()
        self.counts: Counter = Counter()        # (day, channel) -> [requests, failed, outputs]
        self.failed: Counter = Counter()
        self.outputs: Counter = Counter()
        self.visitors: set = set()               # (day, hash)
        self.day = utcnow().date()
        self._stop = threading.Event()
        self._thread = None

    # ---- counting (hot path: memory only) ----------------------------------------------------------

    def visitor(self, ip: str, day: date) -> str:
        return hashlib.sha256(self.secret + day.isoformat().encode() + b"|" + ip.encode()).hexdigest()[:20]

    def count(self, channel: str, ok: bool, outputs: int = 0, ip: str = ""):
        day = utcnow().date()
        with self.lock:
            self.counts[(day, channel)] += 1
            if not ok:
                self.failed[(day, channel)] += 1
            self.outputs[(day, channel)] += outputs
            if channel == "anonymous" and ip:
                self.visitors.add((day, self.visitor(ip, day)))

    # ---- flushing --------------------------------------------------------------------------------

    def _insert(self):
        name = self.db.engine.dialect.name
        if name == "postgresql":
            from sqlalchemy.dialects.postgresql import insert
        else:
            from sqlalchemy.dialects.sqlite import insert
        return insert

    def flush(self):
        with self.lock:
            counts, failed, outputs, visitors = self.counts, self.failed, self.outputs, self.visitors
            self.counts, self.failed, self.outputs, self.visitors = Counter(), Counter(), Counter(), set()
        if not counts and not visitors:
            return
        insert = self._insert()
        try:
            with self.db.Session.begin() as s:
                for (day, channel), n in counts.items():
                    st = insert(TrafficDaily).values(day=day, channel=channel, requests=n,
                                                     failed=failed[(day, channel)], outputs=outputs[(day, channel)])
                    s.execute(st.on_conflict_do_update(
                        index_elements=["day", "channel"],
                        set_={"requests": TrafficDaily.requests + st.excluded.requests,
                              "failed": TrafficDaily.failed + st.excluded.failed,
                              "outputs": TrafficDaily.outputs + st.excluded.outputs}))
                if visitors:
                    s.execute(insert(VisitorDaily).values([{"day": d, "visitor": v} for d, v in visitors])
                              .on_conflict_do_nothing(index_elements=["day", "visitor"]))
        except Exception as e:  # keep the counts for the next try rather than lose them
            log.error(json.dumps({"event": "traffic_flush_failed", "error": repr(e)}))
            with self.lock:
                self.counts.update(counts); self.failed.update(failed); self.outputs.update(outputs)
                self.visitors |= visitors

    def tick(self):
        """Flush; when the UTC day has changed, log the finished day."""
        self.flush()
        today = utcnow().date()
        if today != self.day:
            finished, self.day = self.day, today
            try:
                row = self.report(1, end=finished)["days"][0]
                log.info(json.dumps({"event": "daily_stats", **row, "users_total": self.users_total()}))
            except Exception as e:
                log.error(json.dumps({"event": "daily_stats_failed", "error": repr(e)}))

    def start(self):
        def loop():
            while not self._stop.wait(self.flush_s):
                self.tick()
        self._thread = threading.Thread(target=loop, name="traffic-flush", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        self.flush()

    # ---- reading ---------------------------------------------------------------------------------

    def users_total(self) -> int:
        with self.db.Session() as s:
            return int(s.scalar(select(func.count()).select_from(User)) or 0)

    def report(self, days: int, end: date | None = None) -> dict:
        """Per-day numbers for the `days` days ending at `end` (default today, UTC), oldest first."""
        self.flush()
        end = end or utcnow().date()
        start = end - timedelta(days=days - 1)
        with self.db.Session() as s:
            t = s.execute(select(TrafficDaily.day, TrafficDaily.channel, TrafficDaily.requests,
                                 TrafficDaily.failed, TrafficDaily.outputs)
                          .where(TrafficDaily.day >= start, TrafficDaily.day <= end)).all()
            v = dict(s.execute(select(VisitorDaily.day, func.count())
                               .where(VisitorDaily.day >= start, VisitorDaily.day <= end)
                               .group_by(VisitorDaily.day)).all())
            active = dict(s.execute(select(UsageDaily.day, func.count(distinct(UsageDaily.user_id)))
                                    .where(UsageDaily.day >= start, UsageDaily.day <= end)
                                    .group_by(UsageDaily.day)).all())
            created = s.execute(select(User.created_at).where(User.created_at >= start)).scalars().all()
            total = int(s.scalar(select(func.count()).select_from(User)) or 0)
            with_keys = int(s.scalar(select(func.count(distinct(ApiKey.user_id)))) or 0)
        d = lambda x: x.date() if isinstance(x, datetime) else x if isinstance(x, date) else date.fromisoformat(str(x)[:10])
        signups = Counter(d(c) for c in created)
        v, active = {d(k): n for k, n in v.items()}, {d(k): n for k, n in active.items()}
        rows = {}
        for i in range(days):
            day = start + timedelta(days=i)
            rows[day] = {"day": day.isoformat(), "requests": 0, "failed": 0, "outputs": 0,
                         "by_channel": {c: 0 for c in CHANNELS},
                         "anonymous_visitors": int(v.get(day, 0)), "active_users": int(active.get(day, 0)),
                         "new_users": int(signups.get(day, 0))}
        for day, channel, n, f, o in t:
            r = rows[d(day)]
            r["requests"] += n; r["failed"] += f; r["outputs"] += o
            r["by_channel"][channel] = r["by_channel"].get(channel, 0) + n
        series = list(rows.values())
        return {"days": series, "users": {"total": total, "with_keys": with_keys},
                "totals": {"requests": sum(r["requests"] for r in series),
                           "new_users": sum(r["new_users"] for r in series)}}
