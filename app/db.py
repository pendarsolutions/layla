"""Accounts storage: users, API keys, daily usage. Postgres in deployment, SQLite for local runs and tests.

Schema changes go through Alembic (migrations/). `init()` brings the database to the latest revision.
"""
from datetime import date, datetime, timezone
from pathlib import Path

from sqlalchemy import (Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, create_engine, event)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

ROOT = Path(__file__).resolve().parent.parent


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)  # stored as naive UTC on every backend


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    picture: Mapped[str] = mapped_column(String(500), default="")
    quota_limit: Mapped[int] = mapped_column(Integer, default=100)
    quota_used: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ApiKey(Base):
    __tablename__ = "api_keys"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    prefix: Mapped[str] = mapped_column(String(16))           # shown in the UI: "lyl_ab12cd34"
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # sha256 of the full key
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class UsageDaily(Base):
    __tablename__ = "usage_daily"
    __table_args__ = (UniqueConstraint("key_id", "day", name="uq_usage_key_day"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    key_id: Mapped[int] = mapped_column(ForeignKey("api_keys.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(Date)
    requests: Mapped[int] = mapped_column(Integer, default=0)


class Database:
    def __init__(self, url: str):
        self.url = url
        kw = {"pool_pre_ping": True}
        if url.startswith("sqlite"):
            kw["connect_args"] = {"check_same_thread": False}
        else:
            kw.update(pool_size=5, max_overflow=5)
        self.engine = create_engine(url, **kw)
        if url.startswith("sqlite"):
            @event.listens_for(self.engine, "connect")
            def _fk(conn, _):
                conn.execute("PRAGMA foreign_keys=ON")
        self.Session = sessionmaker(self.engine, expire_on_commit=False)

    def migrate(self):
        """alembic upgrade head, programmatically (same as `alembic upgrade head`)."""
        from alembic import command
        from alembic.config import Config
        cfg = Config(str(ROOT / "alembic.ini"))
        cfg.set_main_option("script_location", str(ROOT / "migrations"))
        cfg.attributes["connection_url"] = self.url
        command.upgrade(cfg, "head")

    def ping(self) -> bool:
        from sqlalchemy import text
        with self.engine.connect() as c:
            c.execute(text("select 1"))
        return True
