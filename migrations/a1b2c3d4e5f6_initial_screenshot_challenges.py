"""Initial screenshot challenges tables

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2026-04-14

"""
import sqlalchemy as sa

from CTFd.plugins.migrations import get_all_tables, get_columns_for_table

revision = "a1b2c3d4e5f6"
down_revision = None
branch_labels = None
depends_on = None


def upgrade(op=None):
    tables = get_all_tables(op)

    if "screenshot_challenge" not in tables:
        op.create_table(
            "screenshot_challenge",
            sa.Column(
                "id",
                sa.Integer(),
                sa.ForeignKey("challenges.id", ondelete="CASCADE"),
                primary_key=True,
            ),
            sa.Column("submission_points", sa.Integer(), default=0),
            sa.Column("allowed_extensions", sa.String(256), default="png,jpg,jpeg,gif,bmp,webp"),
            sa.Column("max_file_size", sa.Integer(), default=10485760),
        )

    if "screenshot_submissions" not in tables:
        op.create_table(
            "screenshot_submissions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "submission_id",
                sa.Integer(),
                sa.ForeignKey("submissions.id", ondelete="CASCADE"),
                nullable=True,
            ),
            sa.Column(
                "challenge_id",
                sa.Integer(),
                sa.ForeignKey("challenges.id", ondelete="CASCADE"),
            ),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
            ),
            sa.Column(
                "team_id",
                sa.Integer(),
                sa.ForeignKey("teams.id", ondelete="CASCADE"),
                nullable=True,
            ),
            sa.Column("file_location", sa.Text()),
            sa.Column("status", sa.String(32), default="pending"),
            sa.Column(
                "award_id",
                sa.Integer(),
                sa.ForeignKey("awards.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "reviewer_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("review_date", sa.DateTime(), nullable=True),
            sa.Column("review_comment", sa.Text(), nullable=True),
            sa.Column("date", sa.DateTime()),
        )


def downgrade(op=None):
    op.drop_table("screenshot_submissions")
    op.drop_table("screenshot_challenge")
