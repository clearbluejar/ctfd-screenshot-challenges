"""
Regression tests for award accounting in the screenshot_challenges plugin.

Run from the CTFd repo root:
    pytest CTFd/plugins/screenshot_challenges/test_screenshot_challenges.py -v
"""
import io
from unittest.mock import MagicMock, patch

import pytest
from werkzeug.datastructures import MultiDict

from CTFd.models import Awards, Solves, Submissions, db
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


def _submit_screenshots(client, challenge_id, filenames):
    with client.session_transaction() as sess:
        nonce = sess.get("nonce")
    data = MultiDict([
        ("challenge_id", str(challenge_id)),
        ("nonce", nonce),
    ])
    for filename in filenames:
        data.add("file", (io.BytesIO(b"\x89PNG\r\n\x1a\nfake"), filename))
    return client.post(
        "/plugins/screenshot_challenges/submit",
        data=data,
        content_type="multipart/form-data",
    )


def _screenshot_submissions(app, challenge_id, user_name="user"):
    from CTFd.models import Users
    from CTFd.plugins.screenshot_challenges import ScreenshotSubmission
    with app.app_context():
        u = Users.query.filter_by(name=user_name).first()
        return ScreenshotSubmission.query.filter_by(
            user_id=u.id,
            challenge_id=challenge_id,
        ).order_by(ScreenshotSubmission.id.asc()).all()


def _screenshot_submission_count(app, challenge_id, user_name="user"):
    with app.app_context():
        return len(_screenshot_submissions(app, challenge_id, user_name))


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


def _reviews_json(client, grouped=False):
    url = "/plugins/screenshot_challenges/api/reviews?status=pending"
    if grouped:
        url += "&grouped=1"
    response = client.get(url)
    assert response.status_code == 200, response.get_data(as_text=True)
    return response.get_json()


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


def test_upload_four_screenshots_creates_four_submissions_and_one_award(app):
    challenge_id = _make_challenge(app)
    register_user(app)
    user = login_as_user(app)

    r = _submit_screenshots(
        user,
        challenge_id,
        ["proof1.png", "proof2.png", "proof3.png", "proof4.png"],
    )
    assert r.status_code == 200, r.get_data(as_text=True)
    data = r.get_json()["data"]
    assert data["status"] == "paused"
    assert "4 screenshot(s) submitted" in data["message"]
    assert _screenshot_submission_count(app, challenge_id) == 4
    assert _award_count(app) == 1
    submissions = _screenshot_submissions(app, challenge_id)
    assert len({ss.submission_id for ss in submissions}) == 1
    with app.app_context():
        recorded = Submissions.query.filter_by(id=submissions[0].submission_id).first()
        assert recorded.provided.startswith("[screenshots:")


def test_review_api_groups_multi_image_attempt_for_admin_reviews(app):
    challenge_id = _make_challenge(app)
    register_user(app)
    user = login_as_user(app)
    admin = login_as_user(app, name="admin", password="password")

    r = _submit_screenshots(
        user,
        challenge_id,
        ["proof1.png", "proof2.png", "proof3.png", "proof4.png"],
    )
    assert r.status_code == 200, r.get_data(as_text=True)

    flat = _reviews_json(admin, grouped=False)
    assert len(flat["data"]) == 4

    grouped = _reviews_json(admin, grouped=True)
    assert len(grouped["data"]) == 1
    review = grouped["data"][0]
    assert review["image_count"] == 4
    assert len(review["files"]) == 4
    assert len({file["id"] for file in review["files"]}) == 4


def test_upload_more_than_four_screenshots_is_rejected(app):
    challenge_id = _make_challenge(app)
    register_user(app)
    user = login_as_user(app)

    r = _submit_screenshots(
        user,
        challenge_id,
        [
            "proof1.png",
            "proof2.png",
            "proof3.png",
            "proof4.png",
            "proof5.png",
        ],
    )
    assert r.status_code == 400, r.get_data(as_text=True)
    data = r.get_json()["data"]
    assert data["status"] == "incorrect"
    assert "You may upload up to 4 images" in data["message"]
    assert _screenshot_submission_count(app, challenge_id) == 0


def test_upload_oversized_screenshot_is_rejected(app):
    challenge_id = _make_challenge(app)
    register_user(app)
    user = login_as_user(app)

    with user.session_transaction() as sess:
        nonce = sess.get("nonce")
    oversized = io.BytesIO(b"\x00" * (10485760 + 1))
    response = user.post(
        "/plugins/screenshot_challenges/submit",
        data={
            "challenge_id": str(challenge_id),
            "nonce": nonce,
            "file": (oversized, "big.png"),
        },
        content_type="multipart/form-data",
    )
    assert response.status_code == 400, response.get_data(as_text=True)
    data = response.get_json()["data"]
    assert data["status"] == "incorrect"
    assert "Maximum size" in data["message"]
    assert _screenshot_submission_count(app, challenge_id) == 0


def test_approving_one_screenshot_approves_whole_multi_image_attempt(app):
    challenge_id = _make_challenge(app)
    register_user(app)
    user = login_as_user(app)
    admin = login_as_user(app, name="admin", password="password")

    r = _submit_screenshots(user, challenge_id, ["proof1.png", "proof2.png"])
    assert r.status_code == 200, r.get_data(as_text=True)
    review_id = _latest_review_id(app, challenge_id)

    r = admin.post(
        f"/plugins/screenshot_challenges/api/reviews/{review_id}/approve",
        json={"comment": "good"},
    )
    assert r.status_code == 200, r.get_data(as_text=True)
    assert _user_score(app) == VALUE
    assert _award_count(app) == 0
    submissions = _screenshot_submissions(app, challenge_id)
    assert {ss.status for ss in submissions} == {"approved"}
    with app.app_context():
        assert Solves.query.count() == 1


def test_rejecting_one_screenshot_rejects_whole_multi_image_attempt(app):
    challenge_id = _make_challenge(app)
    register_user(app)
    user = login_as_user(app)
    admin = login_as_user(app, name="admin", password="password")

    r = _submit_screenshots(user, challenge_id, ["proof1.png", "proof2.png"])
    assert r.status_code == 200, r.get_data(as_text=True)
    review_id = _latest_review_id(app, challenge_id)

    r = admin.post(
        f"/plugins/screenshot_challenges/api/reviews/{review_id}/reject",
        json={"comment": "missing context"},
    )
    assert r.status_code == 200, r.get_data(as_text=True)
    assert _user_score(app) == 0
    assert _award_count(app) == 0
    submissions = _screenshot_submissions(app, challenge_id)
    assert {ss.status for ss in submissions} == {"rejected"}

    status = user.get(f"/plugins/screenshot_challenges/api/my-status/{challenge_id}")
    assert status.status_code == 200, status.get_data(as_text=True)
    data = status.get_json()
    assert data["status"] == "rejected"
    assert data["review_comment"] == "missing context"
