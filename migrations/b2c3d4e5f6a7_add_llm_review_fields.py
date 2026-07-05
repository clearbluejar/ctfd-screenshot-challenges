"""Add LLM review fields to screenshot submissions

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-05

"""
import sqlalchemy as sa

from CTFd.plugins.migrations import get_columns_for_table

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade(op=None):
    challenge_columns = get_columns_for_table(
        op=op, table_name="screenshot_challenge", names_only=True
    )
    if "llm_judge_instructions" not in challenge_columns:
        op.add_column(
            "screenshot_challenge",
            sa.Column("llm_judge_instructions", sa.Text(), nullable=True),
        )

    submission_columns = get_columns_for_table(
        op=op, table_name="screenshot_submissions", names_only=True
    )
    if "llm_score" not in submission_columns:
        op.add_column(
            "screenshot_submissions",
            sa.Column("llm_score", sa.Integer(), nullable=True),
        )
    if "llm_feedback" not in submission_columns:
        op.add_column(
            "screenshot_submissions",
            sa.Column("llm_feedback", sa.Text(), nullable=True),
        )
    if "llm_model" not in submission_columns:
        op.add_column(
            "screenshot_submissions",
            sa.Column("llm_model", sa.String(length=128), nullable=True),
        )
    if "llm_review_date" not in submission_columns:
        op.add_column(
            "screenshot_submissions",
            sa.Column("llm_review_date", sa.DateTime(), nullable=True),
        )
    if "llm_error" not in submission_columns:
        op.add_column(
            "screenshot_submissions",
            sa.Column("llm_error", sa.Text(), nullable=True),
        )


def downgrade(op=None):
    columns = get_columns_for_table(
        op=op, table_name="screenshot_submissions", names_only=True
    )
    if "llm_error" in columns:
        op.drop_column("screenshot_submissions", "llm_error")
    if "llm_review_date" in columns:
        op.drop_column("screenshot_submissions", "llm_review_date")
    if "llm_model" in columns:
        op.drop_column("screenshot_submissions", "llm_model")
    if "llm_feedback" in columns:
        op.drop_column("screenshot_submissions", "llm_feedback")
    if "llm_score" in columns:
        op.drop_column("screenshot_submissions", "llm_score")
    challenge_columns = get_columns_for_table(
        op=op, table_name="screenshot_challenge", names_only=True
    )
    if "llm_judge_instructions" in challenge_columns:
        op.drop_column("screenshot_challenge", "llm_judge_instructions")
