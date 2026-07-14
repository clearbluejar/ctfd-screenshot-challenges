"""Add comment_seen flag to screenshot submissions

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-07-10

"""
import sqlalchemy as sa

from CTFd.plugins.migrations import get_columns_for_table

revision = "c3d4e5f6a7b8"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade(op=None):
    submission_columns = get_columns_for_table(
        op=op, table_name="screenshot_submissions", names_only=True
    )
    if "comment_seen" not in submission_columns:
        op.add_column(
            "screenshot_submissions",
            sa.Column("comment_seen", sa.Boolean(), nullable=True, default=False),
        )


def downgrade(op=None):
    columns = get_columns_for_table(
        op=op, table_name="screenshot_submissions", names_only=True
    )
    if "comment_seen" in columns:
        op.drop_column("screenshot_submissions", "comment_seen")
