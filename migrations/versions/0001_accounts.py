"""accounts: users, api_keys, usage_daily

Revision ID: 0001_accounts
Revises:
Create Date: 2026-10-03
"""
import sqlalchemy as sa
from alembic import op

revision = "0001_accounts"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("google_sub", sa.String(64), nullable=True),
        sa.Column("name", sa.String(200), nullable=False, server_default=""),
        sa.Column("picture", sa.String(500), nullable=False, server_default=""),
        sa.Column("quota_limit", sa.Integer, nullable=False, server_default="100"),
        sa.Column("quota_used", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("last_login_at", sa.DateTime, nullable=True),
        sa.UniqueConstraint("google_sub", name="uq_users_google_sub"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "api_keys",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("prefix", sa.String(16), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("last_used_at", sa.DateTime, nullable=True),
        sa.Column("revoked_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_api_keys_user_id", "api_keys", ["user_id"])
    op.create_index("ix_api_keys_key_hash", "api_keys", ["key_hash"], unique=True)

    op.create_table(
        "usage_daily",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key_id", sa.Integer, sa.ForeignKey("api_keys.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day", sa.Date, nullable=False),
        sa.Column("requests", sa.Integer, nullable=False, server_default="0"),
        sa.UniqueConstraint("key_id", "day", name="uq_usage_key_day"),
    )
    op.create_index("ix_usage_daily_user_id", "usage_daily", ["user_id"])


def downgrade() -> None:
    op.drop_table("usage_daily")
    op.drop_index("ix_api_keys_key_hash", "api_keys")
    op.drop_index("ix_api_keys_user_id", "api_keys")
    op.drop_table("api_keys")
    op.drop_index("ix_users_email", "users")
    op.drop_table("users")
