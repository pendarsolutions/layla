import os

from alembic import context
from sqlalchemy import create_engine

from app.db import Base

config = context.config
url = config.attributes.get("connection_url") or os.environ.get("LAYLA_DATABASE_URL", "sqlite:///./layla.db")


def run_offline():
    context.configure(url=url, target_metadata=Base.metadata, literal_binds=True, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


def run_online():
    engine = create_engine(url)
    with engine.connect() as conn:
        context.configure(connection=conn, target_metadata=Base.metadata, render_as_batch=True)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


run_offline() if context.is_offline_mode() else run_online()
