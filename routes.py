import datetime
import os

from flask import Blueprint, abort, jsonify, render_template, request, send_file
from sqlalchemy.exc import IntegrityError
from werkzeug.utils import safe_join

from CTFd.models import Awards, Challenges, Solves, Submissions, db
from CTFd.plugins.screenshot_challenges import ScreenshotChallenge, ScreenshotSubmission
from CTFd.utils.decorators import admins_only, authed_only
from CTFd.utils.uploads import get_uploader
from CTFd.utils.user import get_current_team, get_current_user, get_ip

screenshot_bp = Blueprint(
    "screenshot_bp",
    __name__,
    template_folder="assets",
)

MAX_SCREENSHOT_UPLOADS = 4


def _provided_for_locations(locations):
    if len(locations) == 1:
        return f"[screenshot:{locations[0]}]"
    return f"[screenshots:{','.join(locations)}]"


def _review_group(ss):
    if not ss.submission_id:
        return [ss]
    return ScreenshotSubmission.query.filter_by(
        submission_id=ss.submission_id,
        challenge_id=ss.challenge_id,
        user_id=ss.user_id,
    ).all()


def _serialize_review(ss):
    return {
        "id": ss.id,
        "submission_id": ss.submission_id,
        "challenge_id": ss.challenge_id,
        "challenge_name": ss.challenge.name if ss.challenge else "Unknown",
        "challenge_category": ss.challenge.category if ss.challenge else "",
        "challenge_description": ss.challenge.description if ss.challenge else "",
        "user_id": ss.user_id,
        "user_name": ss.user.name if ss.user else "Unknown",
        "team_id": ss.team_id,
        "team_name": ss.team.name if ss.team else None,
        "file_location": ss.file_location,
        "status": ss.status,
        "reviewer": ss.reviewer.name if ss.reviewer else None,
        "review_date": ss.review_date.isoformat() if ss.review_date else None,
        "review_comment": ss.review_comment,
        "date": ss.date.isoformat() if ss.date else None,
    }


def _serialize_review_group(group):
    first = group[0]
    data = _serialize_review(first)
    data["files"] = [
        {
            "id": ss.id,
            "file_location": ss.file_location,
            "status": ss.status,
        }
        for ss in group
        if ss.file_location
    ]
    data["image_count"] = len(data["files"])
    return data


@screenshot_bp.route("/plugins/screenshot_challenges/submit", methods=["POST"])
@authed_only
def submit_screenshot():
    user = get_current_user()
    team = get_current_team()

    challenge_id = request.form.get("challenge_id", type=int)
    if not challenge_id:
        return jsonify({"data": {"status": "incorrect", "message": "Missing challenge ID."}}), 400

    challenge = ScreenshotChallenge.query.filter_by(id=challenge_id).first()
    if not challenge:
        return jsonify({"data": {"status": "incorrect", "message": "Challenge not found."}}), 404

    if challenge.state == "hidden":
        return jsonify({"data": {"status": "incorrect", "message": "Challenge is not available."}}), 403

    # Check if already solved
    solve_query = Solves.query.filter_by(challenge_id=challenge_id, user_id=user.id)
    if solve_query.first():
        return jsonify({"data": {"status": "already_solved", "message": "You have already solved this challenge."}})

    files = [f for f in request.files.getlist("file") if f and f.filename]
    if not files:
        return jsonify({"data": {"status": "incorrect", "message": "No file uploaded."}}), 400
    if len(files) > MAX_SCREENSHOT_UPLOADS:
        return jsonify({"data": {"status": "incorrect", "message": f"You may upload up to {MAX_SCREENSHOT_UPLOADS} images."}}), 400

    allowed = [ext.strip().lower() for ext in challenge.allowed_extensions.split(",")]
    validated_files = []
    for file in files:
        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext not in allowed:
            return jsonify({
                "data": {
                    "status": "incorrect",
                    "message": f"File type '.{ext}' not allowed. Allowed: {', '.join(allowed)}",
                }
            }), 400

        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
        if size > challenge.max_file_size:
            max_mb = challenge.max_file_size / (1024 * 1024)
            return jsonify({
                "data": {
                    "status": "incorrect",
                    "message": f"File too large. Maximum size: {max_mb:.1f} MB",
                }
            }), 400
        validated_files.append((file, ext))

    # Replace existing pending submissions if any exist
    pending_list = ScreenshotSubmission.query.filter_by(
        challenge_id=challenge_id,
        user_id=user.id,
        status="pending",
    ).all()
    if pending_list:
        uploader = get_uploader()
        award_ids = set()
        submission_ids = set()
        for pending in pending_list:
            if pending.file_location:
                try:
                    uploader.delete(filename=pending.file_location)
                except Exception:
                    pass
            if pending.award_id:
                award_ids.add(pending.award_id)
            if pending.submission_id:
                submission_ids.add(pending.submission_id)
            db.session.delete(pending)
        if award_ids:
            Awards.query.filter(Awards.id.in_(award_ids)).delete(synchronize_session=False)
        if submission_ids:
            Submissions.query.filter(Submissions.id.in_(submission_ids)).delete(synchronize_session=False)
        db.session.flush()

    rejected_priors = ScreenshotSubmission.query.filter(
        ScreenshotSubmission.challenge_id == challenge_id,
        ScreenshotSubmission.user_id == user.id,
        ScreenshotSubmission.status == "rejected",
        ScreenshotSubmission.award_id.isnot(None),
    ).all()
    for prior in rejected_priors:
        Awards.query.filter_by(id=prior.award_id).delete()
        prior.award_id = None
    if rejected_priors:
        db.session.flush()

    uploader = get_uploader()
    import hashlib
    import time
    hash_prefix = hashlib.md5(
        f"{user.id}-{challenge_id}-{time.time()}".encode()
    ).hexdigest()[:8]

    uploads = []
    for index, (file, ext) in enumerate(validated_files):
        safe_filename = f"screenshot-{index + 1}.{ext}"
        location = uploader.upload(file_obj=file, filename=safe_filename, path=hash_prefix)
        uploads.append(location)

    submission = Submissions(
        challenge_id=challenge_id,
        user_id=user.id,
        team_id=team.id if team else None,
        ip=get_ip(req=request),
        provided=_provided_for_locations(uploads),
        type="partial",
    )
    db.session.add(submission)
    db.session.flush()

    award_id = None
    if challenge.submission_points and challenge.submission_points > 0:
        award = Awards(
            user_id=user.id,
            team_id=team.id if team else None,
            name=f"Partial: {challenge.name}",
            description=f"Screenshot submission for {challenge.name}",
            value=challenge.submission_points,
            category=challenge.category,
        )
        db.session.add(award)
        db.session.flush()
        award_id = award.id

    for index, location in enumerate(uploads):
        ss = ScreenshotSubmission(
            submission_id=submission.id,
            challenge_id=challenge_id,
            user_id=user.id,
            team_id=team.id if team else None,
            file_location=location,
            status="pending",
            award_id=award_id if index == 0 else None,
        )
        db.session.add(ss)

    db.session.commit()

    msg = f"{len(uploads)} screenshot(s) submitted!"
    if award_id:
        msg += f" Partial credit ({challenge.submission_points} pts) awarded."
    msg += " Awaiting instructor review."

    return jsonify({"data": {"status": "paused", "message": msg}})


@screenshot_bp.route("/plugins/screenshot_reviews")
@admins_only
def review_page():
    from flask import session
    nonce = session.get("nonce", "")
    return render_template("review.html", nonce=nonce)


@screenshot_bp.route("/plugins/screenshot_challenges/api/reviews")
@admins_only
def list_reviews():
    status = request.args.get("status", "pending")
    challenge_id = request.args.get("challenge_id", type=int)
    grouped = request.args.get("grouped") in ("1", "true", "yes")

    query = ScreenshotSubmission.query
    if status != "all":
        query = query.filter_by(status=status)
    if challenge_id:
        query = query.filter_by(challenge_id=challenge_id)

    query = query.order_by(ScreenshotSubmission.date.desc())
    submissions = query.all()

    if grouped:
        groups = {}
        group_order = []
        for ss in submissions:
            key = ss.submission_id or ss.id
            if key not in groups:
                groups[key] = []
                group_order.append(key)
            groups[key].append(ss)
        data = [_serialize_review_group(groups[key]) for key in group_order]
    else:
        data = [_serialize_review(ss) for ss in submissions]

    # Also get challenge list for filter dropdown
    challenges = ScreenshotChallenge.query.all()
    challenge_list = [{"id": c.id, "name": c.name, "category": c.category} for c in challenges]

    return jsonify({"data": data, "challenges": challenge_list})


@screenshot_bp.route("/plugins/screenshot_challenges/api/reviews/<int:review_id>/approve", methods=["POST"])
@admins_only
def approve_review(review_id):
    admin = get_current_user()
    ss = ScreenshotSubmission.query.filter_by(id=review_id).first()
    if not ss:
        return jsonify({"success": False, "message": "Submission not found."}), 404

    if ss.status == "approved":
        return jsonify({"success": False, "message": "Already approved."}), 400

    comment = ""
    if request.is_json:
        comment = request.get_json().get("comment", "")
    else:
        comment = request.form.get("comment", "")

    challenge = Challenges.query.filter_by(id=ss.challenge_id).first()
    if not challenge:
        return jsonify({"success": False, "message": "Challenge not found."}), 404

    group = _review_group(ss)
    locations = [item.file_location for item in group if item.file_location]

    # Create a Solves record
    solve = Solves(
        user_id=ss.user_id,
        team_id=ss.team_id,
        challenge_id=ss.challenge_id,
        ip="admin-approved",
        provided=_provided_for_locations(locations),
    )
    try:
        db.session.add(solve)
        db.session.flush()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"success": False, "message": "User already has a solve for this challenge."}), 400

    # Delete the partial credit award (replaced by full solve value)
    award_ids = {item.award_id for item in group if item.award_id}
    if award_ids:
        Awards.query.filter(Awards.id.in_(award_ids)).delete(synchronize_session=False)

    # Mark original submission as discard
    submission_ids = {item.submission_id for item in group if item.submission_id}
    if submission_ids:
        for orig_sub in Submissions.query.filter(Submissions.id.in_(submission_ids)).all():
            orig_sub.type = "discard"

    # Update screenshot submissions for the whole uploaded set
    now = datetime.datetime.utcnow()
    for item in group:
        item.award_id = None
        item.status = "approved"
        item.reviewer_id = admin.id
        item.review_date = now
        item.review_comment = comment

    db.session.commit()

    return jsonify({"success": True, "message": "Submission approved. Full points awarded."})


@screenshot_bp.route("/plugins/screenshot_challenges/api/reviews/<int:review_id>/reject", methods=["POST"])
@admins_only
def reject_review(review_id):
    admin = get_current_user()
    ss = ScreenshotSubmission.query.filter_by(id=review_id).first()
    if not ss:
        return jsonify({"success": False, "message": "Submission not found."}), 404

    if ss.status != "pending":
        return jsonify({"success": False, "message": "Can only reject pending submissions."}), 400

    comment = ""
    if request.is_json:
        comment = request.get_json().get("comment", "")
    else:
        comment = request.form.get("comment", "")

    group = _review_group(ss)
    award_ids = {item.award_id for item in group if item.award_id}
    if award_ids:
        Awards.query.filter(Awards.id.in_(award_ids)).delete(synchronize_session=False)

    now = datetime.datetime.utcnow()
    for item in group:
        item.award_id = None
        item.status = "rejected"
        item.reviewer_id = admin.id
        item.review_date = now
        item.review_comment = comment

    db.session.commit()

    return jsonify({"success": True, "message": "Submission rejected. Student can resubmit."})


@screenshot_bp.route("/plugins/screenshot_challenges/api/reviews/<int:review_id>/reopen", methods=["POST"])
@admins_only
def reopen_review(review_id):
    ss = ScreenshotSubmission.query.filter_by(id=review_id).first()
    if not ss:
        return jsonify({"success": False, "message": "Submission not found."}), 404

    if ss.status != "approved":
        return jsonify({"success": False, "message": "Can only reopen approved submissions."}), 400

    challenge = ScreenshotChallenge.query.filter_by(id=ss.challenge_id).first()
    if not challenge:
        return jsonify({"success": False, "message": "Challenge not found."}), 404

    group = _review_group(ss)
    award_ids = {item.award_id for item in group if item.award_id}
    if award_ids:
        Awards.query.filter(Awards.id.in_(award_ids)).delete(synchronize_session=False)

    solve_query = Solves.query.filter_by(challenge_id=ss.challenge_id, user_id=ss.user_id)
    if ss.team_id:
        solve_query = solve_query.filter_by(team_id=ss.team_id)
    for solve in solve_query.all():
        db.session.delete(solve)

    submission_ids = {item.submission_id for item in group if item.submission_id}
    if submission_ids:
        for orig_sub in Submissions.query.filter(Submissions.id.in_(submission_ids)).all():
            orig_sub.type = "partial"

    award_id = None
    if challenge.submission_points and challenge.submission_points > 0:
        award = Awards(
            user_id=ss.user_id,
            team_id=ss.team_id,
            name=f"Partial: {challenge.name}",
            description=f"Screenshot submission for {challenge.name}",
            value=challenge.submission_points,
            category=challenge.category,
        )
        db.session.add(award)
        db.session.flush()
        award_id = award.id

    for index, item in enumerate(group):
        item.award_id = award_id if index == 0 else None
        item.status = "pending"
        item.reviewer_id = None
        item.review_date = None
        item.review_comment = None

    db.session.commit()

    return jsonify({"success": True, "message": "Submission reopened for review."})


@screenshot_bp.route("/plugins/screenshot_challenges/files/<path:filepath>")
@admins_only
def serve_screenshot(filepath):
    from flask import current_app
    upload_folder = current_app.config.get("UPLOAD_FOLDER")
    try:
        full_path = safe_join(upload_folder, filepath)
        return send_file(full_path)
    except Exception:
        abort(404)


@screenshot_bp.route("/plugins/screenshot_challenges/api/my-pending")
@authed_only
def my_pending():
    user = get_current_user()
    submissions = ScreenshotSubmission.query.filter(
        ScreenshotSubmission.user_id == user.id,
        ScreenshotSubmission.status.in_(["pending", "rejected"]),
    ).all()
    pending_ids = list(set(ss.challenge_id for ss in submissions if ss.status == "pending"))
    rejected_ids = list(set(ss.challenge_id for ss in submissions if ss.status == "rejected"))
    return jsonify({"pending": pending_ids, "rejected": rejected_ids})


@screenshot_bp.route("/plugins/screenshot_challenges/api/my-status/<int:challenge_id>")
@authed_only
def my_status(challenge_id):
    user = get_current_user()
    ss = ScreenshotSubmission.query.filter_by(
        user_id=user.id,
        challenge_id=challenge_id,
    ).order_by(ScreenshotSubmission.date.desc()).first()
    if not ss:
        return jsonify({"status": None})
    return jsonify({
        "status": ss.status,
        "review_comment": ss.review_comment,
        "date": ss.date.isoformat() if ss.date else None,
    })


@screenshot_bp.route("/plugins/screenshot_challenges/api/storage")
@admins_only
def storage_stats():
    from flask import current_app
    submissions = ScreenshotSubmission.query.all()
    upload_folder = current_app.config.get("UPLOAD_FOLDER")
    total_size = 0
    file_count = 0
    by_status = {"pending": 0, "approved": 0, "rejected": 0}
    for ss in submissions:
        if ss.file_location:
            try:
                full_path = safe_join(upload_folder, ss.file_location)
                size = os.path.getsize(full_path)
                total_size += size
                file_count += 1
                if ss.status in by_status:
                    by_status[ss.status] += size
            except Exception:
                pass
    return jsonify({
        "total_size": total_size,
        "file_count": file_count,
        "by_status": by_status,
    })


@screenshot_bp.route("/plugins/screenshot_challenges/api/bulk-delete", methods=["POST"])
@admins_only
def bulk_delete_files():
    data = request.get_json() or {}
    ids = data.get("ids", [])
    if not ids:
        return jsonify({"success": False, "message": "No IDs provided."}), 400

    deleted = 0
    for sid in ids:
        ss = ScreenshotSubmission.query.filter_by(id=sid).first()
        if not ss:
            continue
        # Only allow deleting approved/rejected (not pending)
        if ss.status == "pending":
            continue
        if ss.file_location:
            try:
                uploader = get_uploader()
                uploader.delete(filename=ss.file_location)
                ss.file_location = None
                deleted += 1
            except Exception:
                pass
    db.session.commit()
    return jsonify({"success": True, "message": f"Deleted {deleted} file(s)."})
