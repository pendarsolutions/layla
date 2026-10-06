"""traffic: traffic_daily, visitors_daily

Revision ID: 0002_traffic
Revises: 0001_accounts
Create Date: 2026-10-06
"""
import sqlalchemy as sa
from alembic import op

revision = "0002_traffic"
down_revision = "0001_accounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "traffic_daily",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("day", sa.Date, nullable=False),
        sa.Column("channel", sa.String(16), nullable=False),
        sa.Column("requests", sa.Integer, nullable=False, server_default="0"),
        sa.Column("failed", sa.Integer, nullable=False, server_default="0"),
        sa.Column("outputs", sa.Integer, nullable=False, server_default="0"),
        sa.UniqueConstraint("day", "channel", name="uq_traffic_day_channel"),
    )
    op.create_table(
        "visitors_daily",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("day", sa.Date, nullable=False),
        sa.Column("visitor", sa.String(20), nullable=False),
        sa.UniqueConstraint("day", "visitor", name="uq_visitor_day"),
    )


def downgrade() -> None:
    op.drop_table("visitors_daily")
    op.drop_table("traffic_daily")
