import datetime
import os

from flask import Blueprint

from CTFd.models import Awards, Challenges, ChallengeFiles, Fails, Flags, Hints, Solves, Tags, db
from CTFd.plugins import (
    register_admin_plugin_menu_bar,
    register_plugin_assets_directory,
    register_plugin_script,
    register_plugin_stylesheet,
)
from CTFd.plugins.challenges import CHALLENGE_CLASSES, BaseChallenge
from CTFd.plugins.migrations import upgrade
from CTFd.utils.uploads import delete_file


class ScreenshotChallenge(Challenges):
    __mapper_args__ = {"polymorphic_identity": "screenshot"}
    id = db.Column(
        db.Integer, db.ForeignKey("challenges.id", ondelete="CASCADE"), primary_key=True
    )
    submission_points = db.Column(db.Integer, default=0)
    allowed_extensions = db.Column(db.String(256), default="png,jpg,jpeg,gif,bmp,webp")
    max_file_size = db.Column(db.Integer, default=10485760)

    def __init__(self, *args, **kwargs):
        super(ScreenshotChallenge, self).__init__(**kwargs)


class ScreenshotSubmission(db.Model):
    __tablename__ = "screenshot_submissions"
    id = db.Column(db.Integer, primary_key=True)
    submission_id = db.Column(
        db.Integer, db.ForeignKey("submissions.id", ondelete="CASCADE"), nullable=True
    )
    challenge_id = db.Column(
        db.Integer, db.ForeignKey("challenges.id", ondelete="CASCADE")
    )
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"))
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    file_location = db.Column(db.Text)
    status = db.Column(db.String(32), default="pending")
    award_id = db.Column(
        db.Integer, db.ForeignKey("awards.id", ondelete="SET NULL"), nullable=True
    )
    reviewer_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    review_date = db.Column(db.DateTime, nullable=True)
    review_comment = db.Column(db.Text, nullable=True)
    date = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    submission = db.relationship(
        "Submissions", foreign_keys=[submission_id], lazy="select"
    )
    challenge = db.relationship(
        "Challenges", foreign_keys=[challenge_id], lazy="select"
    )
    user = db.relationship(
        "Users", foreign_keys=[user_id], lazy="select"
    )
    team = db.relationship(
        "Teams", foreign_keys=[team_id], lazy="select"
    )
    reviewer = db.relationship(
        "Users", foreign_keys=[reviewer_id], lazy="select"
    )
    award = db.relationship(
        "Awards", foreign_keys=[award_id], lazy="select"
    )


class ScreenshotChallengeType(BaseChallenge):
    id = "screenshot"
    name = "screenshot"
    templates = {
        "create": "/plugins/screenshot_challenges/assets/create.html",
        "update": "/plugins/screenshot_challenges/assets/update.html",
        "view": "/plugins/screenshot_challenges/assets/view.html",
    }
    scripts = {
        "create": "/plugins/screenshot_challenges/assets/create.js",
        "update": "/plugins/screenshot_challenges/assets/update.js",
        "view": "/plugins/screenshot_challenges/assets/view.js",
    }
    route = "/plugins/screenshot_challenges/assets/"
    blueprint = Blueprint(
        "screenshot_challenges",
        __name__,
        template_folder="templates",
        static_folder="assets",
    )
    challenge_model = ScreenshotChallenge

    @classmethod
    def create(cls, request):
        data = request.form or request.get_json()
        challenge = cls.challenge_model(**data)
        db.session.add(challenge)
        db.session.commit()
        return challenge

    @classmethod
    def read(cls, challenge):
        challenge = ScreenshotChallenge.query.filter_by(id=challenge.id).first()
        data = super().read(challenge)
        data.update(
            {
                "submission_points": challenge.submission_points,
                "allowed_extensions": challenge.allowed_extensions,
                "max_file_size": challenge.max_file_size,
            }
        )
        return data

    @classmethod
    def update(cls, challenge, request):
        data = request.form or request.get_json()
        for attr, value in data.items():
            if attr in ("submission_points", "max_file_size"):
                try:
                    value = int(value)
                except (ValueError, TypeError):
                    pass
            setattr(challenge, attr, value)
        db.session.commit()
        return challenge

    @classmethod
    def delete(cls, challenge):
        # Clean up screenshot submissions and their uploaded files
        screenshots = ScreenshotSubmission.query.filter_by(
            challenge_id=challenge.id
        ).all()
        for ss in screenshots:
            # Delete the award if it exists
            if ss.award_id:
                Awards.query.filter_by(id=ss.award_id).delete()
            # Delete the uploaded file via the uploader
            if ss.file_location:
                try:
                    from CTFd.utils.uploads import get_uploader
                    uploader = get_uploader()
                    uploader.delete(filename=ss.file_location)
                except Exception:
                    pass
        ScreenshotSubmission.query.filter_by(challenge_id=challenge.id).delete()

        # Standard cleanup
        Fails.query.filter_by(challenge_id=challenge.id).delete()
        Solves.query.filter_by(challenge_id=challenge.id).delete()
        Flags.query.filter_by(challenge_id=challenge.id).delete()
        files = ChallengeFiles.query.filter_by(challenge_id=challenge.id).all()
        for f in files:
            delete_file(f.id)
        ChallengeFiles.query.filter_by(challenge_id=challenge.id).delete()
        Tags.query.filter_by(challenge_id=challenge.id).delete()
        Hints.query.filter_by(challenge_id=challenge.id).delete()
        Challenges.query.filter_by(id=challenge.id).delete()
        cls.challenge_model.query.filter_by(id=challenge.id).delete()
        db.session.commit()

    @classmethod
    def attempt(cls, challenge, request):
        # Not used - custom submission endpoint bypasses standard attempt flow
        from CTFd.plugins.challenges import ChallengeResponse
        return ChallengeResponse(
            status="incorrect",
            message="Please use the file upload to submit a screenshot.",
        )

    @classmethod
    def solve(cls, user, team, challenge, request):
        super().solve(user, team, challenge, request)


def load(app):
    upgrade(plugin_name="screenshot_challenges")
    CHALLENGE_CLASSES["screenshot"] = ScreenshotChallengeType
    register_plugin_assets_directory(
        app, base_path="/plugins/screenshot_challenges/assets/"
    )

    from CTFd.plugins.screenshot_challenges.routes import screenshot_bp
    app.register_blueprint(screenshot_bp)

    register_admin_plugin_menu_bar(
        "Screenshot Reviews", "/plugins/screenshot_reviews"
    )
    register_plugin_script("/plugins/screenshot_challenges/assets/pending.js")
    register_plugin_stylesheet("/plugins/screenshot_challenges/assets/pending.css")
