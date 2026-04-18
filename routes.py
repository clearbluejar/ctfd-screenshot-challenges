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

    # Replace existing pending submission if one exists
    pending = ScreenshotSubmission.query.filter_by(
        challenge_id=challenge_id,
        user_id=user.id,
        status="pending",
    ).first()
    if pending:
        # Delete old uploaded file
        if pending.file_location:
            try:
                uploader = get_uploader()
                uploader.delete(filename=pending.file_location)
            except Exception:
                pass
        # Delete old partial credit award
        if pending.award_id:
            Awards.query.filter_by(id=pending.award_id).delete()
        # Delete old submission record
        if pending.submission_id:
            Submissions.query.filter_by(id=pending.submission_id).delete()
        db.session.delete(pending)
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

    # Validate file
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"data": {"status": "incorrect", "message": "No file uploaded."}}), 400

    # Check extension
    allowed = [ext.strip().lower() for ext in challenge.allowed_extensions.split(",")]
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in allowed:
        return jsonify({
            "data": {
                "status": "incorrect",
                "message": f"File type '.{ext}' not allowed. Allowed: {', '.join(allowed)}",
            }
        }), 400

    # Check file size
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

    # Upload file using CTFd's uploader
    uploader = get_uploader()
    # Create a unique directory for the upload
    import hashlib
    import time
    hash_prefix = hashlib.md5(
        f"{user.id}-{challenge_id}-{time.time()}".encode()
    ).hexdigest()[:8]
    safe_filename = f"screenshot.{ext}"
    location = uploader.upload(file_obj=file, filename=safe_filename, path=hash_prefix)

    # Create a Submissions record (type "partial")
    submission = Submissions(
        challenge_id=challenge_id,
        user_id=user.id,
        team_id=team.id if team else None,
        ip=get_ip(req=request),
        provided=f"[screenshot:{location}]",
        type="partial",
    )
    db.session.add(submission)
    db.session.flush()

    # Create partial credit award if submission_points > 0
    award = None
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

    # Create ScreenshotSubmission record
    ss = ScreenshotSubmission(
        submission_id=submission.id,
        challenge_id=challenge_id,
        user_id=user.id,
        team_id=team.id if team else None,
        file_location=location,
        status="pending",
        award_id=award_id,
    )
    db.session.add(ss)
    db.session.commit()

    msg = "Screenshot submitted!"
    if challenge.submission_points and challenge.submission_points > 0:
        msg += f" Partial credit ({challenge.submission_points} pts) awarded."
    msg += " Awaiting instructor review."

    return jsonify({"data": {"status": "correct", "message": msg}})


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

    query = ScreenshotSubmission.query
    if status != "all":
        query = query.filter_by(status=status)
    if challenge_id:
        query = query.filter_by(challenge_id=challenge_id)

    query = query.order_by(ScreenshotSubmission.date.desc())
    submissions = query.all()

    data = []
    for ss in submissions:
        data.append({
            "id": ss.id,
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
        })

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

    # Create a Solves record
    solve = Solves(
        user_id=ss.user_id,
        team_id=ss.team_id,
        challenge_id=ss.challenge_id,
        ip="admin-approved",
        provided=f"[screenshot:{ss.file_location}]",
    )
    try:
        db.session.add(solve)
        db.session.flush()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"success": False, "message": "User already has a solve for this challenge."}), 400

    # Delete the partial credit award (replaced by full solve value)
    if ss.award_id:
        Awards.query.filter_by(id=ss.award_id).delete()
        ss.award_id = None

    # Mark original submission as discard
    if ss.submission_id:
        orig_sub = Submissions.query.filter_by(id=ss.submission_id).first()
        if orig_sub:
            orig_sub.type = "discard"

    # Update screenshot submission
    ss.status = "approved"
    ss.reviewer_id = admin.id
    ss.review_date = datetime.datetime.utcnow()
    ss.review_comment = comment

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

    if ss.award_id:
        Awards.query.filter_by(id=ss.award_id).delete()
        ss.award_id = None

    ss.status = "rejected"
    ss.reviewer_id = admin.id
    ss.review_date = datetime.datetime.utcnow()
    ss.review_comment = comment

    db.session.commit()

    return jsonify({"success": True, "message": "Submission rejected. Student can resubmit."})


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
