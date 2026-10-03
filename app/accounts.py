"""Account operations: sign-in upsert, API keys, the free request quota and daily usage.

All functions are synchronous (SQLAlchemy sessions); the HTTP layer calls them in a thread pool.
"""
import hashlib
import secrets
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from .db import ApiKey, Database, UsageDaily, User, utcnow

KEY_PREFIX = "lyl_"


def hash_key(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


class Accounts:
    def __init__(self, db: Database, free_requests: int, max_keys: int):
        self.db, self.free_requests, self.max_keys = db, free_requests, max_keys

    # ---- users ----------------------------------------------------------------------------------

    def sign_in(self, email: str, name: str = "", picture: str = "", google_sub: Optional[str] = None) -> User:
        email = email.strip().lower()
        with self.db.Session.begin() as s:
            user = None
            if google_sub:
                user = s.scalar(select(User).where(User.google_sub == google_sub))
            if user is None:
                user = s.scalar(select(User).where(User.email == email))
            if user is None:
                user = User(email=email, name=name or email.split("@")[0], picture=picture,
                            google_sub=google_sub, quota_limit=self.free_requests, quota_used=0)
                s.add(user)
            else:
                user.name = name or user.name
                user.picture = picture or user.picture
                user.google_sub = google_sub or user.google_sub
            user.last_login_at = utcnow()
            s.flush()
            return user

    def get_user(self, user_id: int) -> Optional[User]:
        with self.db.Session() as s:
            return s.get(User, user_id)

    def overview(self, user_id: int) -> Optional[dict]:
        with self.db.Session() as s:
            u = s.get(User, user_id)
            if u is None:
                return None
            active = s.scalar(select(func.count()).select_from(ApiKey)
                              .where(ApiKey.user_id == user_id, ApiKey.revoked_at.is_(None)))
            return {
                "user": {"email": u.email, "name": u.name, "picture": u.picture,
                         "member_since": u.created_at.date().isoformat()},
                "quota": {"limit": u.quota_limit, "used": u.quota_used,
                          "remaining": max(0, u.quota_limit - u.quota_used)},
                "premium": {"available": False, "message": "Premium plans are coming soon."},
                "keys": {"active": int(active or 0), "max": self.max_keys},
            }

    # ---- keys -----------------------------------------------------------------------------------

    def list_keys(self, user_id: int) -> list:
        with self.db.Session() as s:
            rows = s.scalars(select(ApiKey).where(ApiKey.user_id == user_id, ApiKey.revoked_at.is_(None))
                             .order_by(ApiKey.created_at.desc(), ApiKey.id.desc())).all()
            return [key_view(k) for k in rows]

    def create_key(self, user_id: int, name: str):
        """-> (view, secret) or None when the user already has max_keys active keys."""
        secret = KEY_PREFIX + secrets.token_urlsafe(32)
        with self.db.Session.begin() as s:
            active = s.scalar(select(func.count()).select_from(ApiKey)
                              .where(ApiKey.user_id == user_id, ApiKey.revoked_at.is_(None)))
            if active >= self.max_keys:
                return None
            k = ApiKey(user_id=user_id, name=name, prefix=secret[:12], key_hash=hash_key(secret))
            s.add(k)
            s.flush()
            return key_view(k), secret

    def revoke_key(self, user_id: int, key_id: int) -> bool:
        """Only the owner can revoke; someone else's key looks exactly like a missing one."""
        with self.db.Session.begin() as s:
            r = s.execute(update(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user_id,
                                               ApiKey.revoked_at.is_(None)).values(revoked_at=utcnow()))
            return r.rowcount == 1

    def resolve_key(self, secret: str) -> Optional[tuple]:
        """-> (key_id, user_id, key_name) for an active key, else None."""
        if not secret.startswith(KEY_PREFIX):
            return None
        with self.db.Session() as s:
            k = s.scalar(select(ApiKey).where(ApiKey.key_hash == hash_key(secret), ApiKey.revoked_at.is_(None)))
            return (k.id, k.user_id, k.name) if k else None

    # ---- quota and usage --------------------------------------------------------------------------

    def reserve(self, user_id: int) -> bool:
        """Take one request from the quota, atomically. False when nothing is left."""
        with self.db.Session.begin() as s:
            r = s.execute(update(User).where(User.id == user_id, User.quota_used < User.quota_limit)
                          .values(quota_used=User.quota_used + 1))
            return r.rowcount == 1

    def refund(self, user_id: int):
        with self.db.Session.begin() as s:
            s.execute(update(User).where(User.id == user_id, User.quota_used > 0)
                      .values(quota_used=User.quota_used - 1))

    def record(self, user_id: int, key_id: int):
        """Count one successful request for today and stamp the key's last use."""
        today = utcnow().date()
        with self.db.Session.begin() as s:
            s.execute(update(ApiKey).where(ApiKey.id == key_id).values(last_used_at=utcnow()))
            r = s.execute(update(UsageDaily).where(UsageDaily.key_id == key_id, UsageDaily.day == today)
                          .values(requests=UsageDaily.requests + 1))
            if r.rowcount:
                return
        try:
            with self.db.Session.begin() as s:
                s.add(UsageDaily(user_id=user_id, key_id=key_id, day=today, requests=1))
        except IntegrityError:  # another request created today's row first
            with self.db.Session.begin() as s:
                s.execute(update(UsageDaily).where(UsageDaily.key_id == key_id, UsageDaily.day == today)
                          .values(requests=UsageDaily.requests + 1))

    def usage(self, user_id: int, days: int) -> dict:
        today = utcnow().date()
        start = today - timedelta(days=days - 1)
        with self.db.Session() as s:
            rows = s.execute(select(UsageDaily.day, func.sum(UsageDaily.requests))
                             .where(UsageDaily.user_id == user_id, UsageDaily.day >= start)
                             .group_by(UsageDaily.day)).all()
        by_day = {d if isinstance(d, date) else date.fromisoformat(str(d)): int(n) for d, n in rows}
        series = [{"day": (start + timedelta(days=i)).isoformat(),
                   "requests": by_day.get(start + timedelta(days=i), 0)} for i in range(days)]
        return {"days": series, "total": sum(x["requests"] for x in series)}


def key_view(k: ApiKey) -> dict:
    return {"id": k.id, "name": k.name, "prefix": k.prefix,
            "created_at": k.created_at.isoformat(timespec="seconds") + "Z",
            "last_used_at": (k.last_used_at.isoformat(timespec="seconds") + "Z") if k.last_used_at else None}
