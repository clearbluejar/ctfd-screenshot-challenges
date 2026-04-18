"""
Regression tests for award accounting in the screenshot_challenges plugin.

Run from the CTFd repo root:
    pytest CTFd/plugins/screenshot_challenges/test_screenshot_challenges.py -v
"""
import io
from unittest.mock import MagicMock, patch

import pytest

from CTFd.models import Awards, Solves, db
from tests.helpers import (
    create_ctfd,
    destroy_ctfd,
    login_as_user,
    register_user,
)


VALUE = 300
PARTIAL = 150


def _user_score(app, user_name="user"):
    from CTFd.models import Users
    with app.app_context():
        u = Users.query.filter_by(name=user_name).first()
        award_total = sum(a.value for a in Awards.query.filter_by(user_id=u.id).all())
        solve_total = 0
        for s in Solves.query.filter_by(user_id=u.id).all():
            solve_total += s.challenge.value
        return award_total + solve_total


def _award_count(app, user_name="user"):
    from CTFd.models import Users
    with app.app_context():
        u = Users.query.filter_by(name=user_name).first()
        return Awards.query.filter_by(user_id=u.id).count()


def _make_challenge(app):
    from CTFd.plugins.screenshot_challenges import ScreenshotChallenge
    with app.app_context():
        chal = ScreenshotChallenge(
            name="Screenshot Test",
            description="upload a screenshot",
            value=VALUE,
            category="test",
            type="screenshot",
            state="visible",
            submission_points=PARTIAL,
        )
        db.session.add(chal)
        db.session.commit()
        return chal.id


def _submit_screenshot(client, challenge_id, filename="proof.png"):
    with client.session_transaction() as sess:
        nonce = sess.get("nonce")
    return client.post(
        "/plugins/screenshot_challenges/submit",
        data={
            "challenge_id": str(challenge_id),
            "nonce": nonce,
            "file": (io.BytesIO(b"\x89PNG\r\n\x1a\nfake"), filename),
        },
        content_type="multipart/form-data",
    )


def _latest_review_id(app, challenge_id, user_name="user"):
    from CTFd.models import Users
    from CTFd.plugins.screenshot_challenges import ScreenshotSubmission
    with app.app_context():
        u = Users.query.filter_by(name=user_name).first()
        ss = (
            ScreenshotSubmission.query
            .filter_by(user_id=u.id, challenge_id=challenge_id)
            .order_by(ScreenshotSubmission.date.desc())
            .first()
        )
        return ss.id


@pytest.fixture
def app():
    fake_uploader = MagicMock()
    counter = {"n": 0}

    def fake_upload(file_obj, filename, path=None):
        counter["n"] += 1
        return f"fake/{counter['n']}/{filename}"

    fake_uploader.upload.side_effect = fake_upload
    fake_uploader.delete.return_value = True

    with patch(
        "CTFd.plugins.screenshot_challenges.routes.get_uploader",
        return_value=fake_uploader,
    ):
        app = create_ctfd(enable_plugins=True)
        try:
            yield app
        finally:
            destroy_ctfd(app)


def test_score_after_reject_resubmit_approve_equals_value(app):
    """
    The bug: every rejected submission left an orphan partial-credit Award,
    and each resubmit added another. After N rejects + 1 approve, the user
    ended up with VALUE + N*PARTIAL instead of VALUE.
    """
    challenge_id = _make_challenge(app)
    register_user(app)

    user = login_as_user(app)
    admin = login_as_user(app, name="admin", password="password")

    # 1. First submission -> partial credit
    r = _submit_screenshot(user, challenge_id)
    assert r.status_code == 200, r.get_data(as_text=True)
    assert _user_score(app) == PARTIAL
    assert _award_count(app) == 1

    # 2. Admin rejects -> partial award MUST be revoked (Bug 1)
    rid = _latest_review_id(app, challenge_id)
    r = admin.post(
        f"/plugins/screenshot_challenges/api/reviews/{rid}/reject",
        json={"comment": "blurry"},
    )
    assert r.status_code == 200, r.get_data(as_text=True)
    assert _user_score(app) == 0, "rejected submission must not leave an orphan Award"
    assert _award_count(app) == 0

    # 3. Resubmit -> exactly one partial award, not stacked (Bug 2)
    r = _submit_screenshot(user, challenge_id)
    assert r.status_code == 200, r.get_data(as_text=True)
    assert _user_score(app) == PARTIAL
    assert _award_count(app) == 1

    # 4. Reject again
    rid = _latest_review_id(app, challenge_id)
    admin.post(
        f"/plugins/screenshot_challenges/api/reviews/{rid}/reject",
        json={"comment": "still blurry"},
    )
    assert _user_score(app) == 0
    assert _award_count(app) == 0

    # 5. Resubmit and approve -> final score must equal VALUE exactly
    r = _submit_screenshot(user, challenge_id)
    assert r.status_code == 200, r.get_data(as_text=True)
    rid = _latest_review_id(app, challenge_id)
    r = admin.post(
        f"/plugins/screenshot_challenges/api/reviews/{rid}/approve",
        json={"comment": "good"},
    )
    assert r.status_code == 200, r.get_data(as_text=True)

    assert _user_score(app) == VALUE, (
        f"after 2 rejects + 1 approve, score must be {VALUE}, "
        f"not {_user_score(app)}"
    )
    assert _award_count(app) == 0, "no partial awards should remain after approval"


def test_reject_with_no_partial_points_is_safe(app):
    """When submission_points=0, no Award is ever created, so reject is a no-op on awards."""
    from CTFd.plugins.screenshot_challenges import ScreenshotChallenge
    with app.app_context():
        chal = ScreenshotChallenge(
            name="Zero Partial",
            description="d",
            value=100,
            category="test",
            type="screenshot",
            state="visible",
            submission_points=0,
        )
        db.session.add(chal)
        db.session.commit()
        cid = chal.id

    register_user(app)
    user = login_as_user(app)
    admin = login_as_user(app, name="admin", password="password")

    _submit_screenshot(user, cid)
    assert _award_count(app) == 0
    assert _user_score(app) == 0

    rid = _latest_review_id(app, cid)
    r = admin.post(
        f"/plugins/screenshot_challenges/api/reviews/{rid}/reject",
        json={"comment": "no"},
    )
    assert r.status_code == 200
    assert _user_score(app) == 0
