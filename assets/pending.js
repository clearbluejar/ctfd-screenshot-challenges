(function() {
    var pendingIds = [];
    var rejectedIds = [];
    var unreadCommentIds = [];

    function fetchStatuses() {
        fetch("/plugins/screenshot_challenges/api/my-pending", { credentials: "same-origin" })
            .then(function(r) {
                if (!r.ok) return { pending: [], rejected: [], unread_comments: [] };
                return r.json();
            })
            .then(function(result) {
                pendingIds = result.pending || [];
                rejectedIds = result.rejected || [];
                unreadCommentIds = result.unread_comments || [];
                if (pendingIds.length > 0 || rejectedIds.length > 0 || unreadCommentIds.length > 0) {
                    applyStyles();
                    observeBoard();
                }
            })
            .catch(function() {});
    }

    function applyStyles() {
        var buttons = document.querySelectorAll("button.challenge-button");
        buttons.forEach(function(btn) {
            var chalId = parseInt(btn.getAttribute("value"), 10);
            var challengeName = btn.textContent.trim() || "Challenge";

            // Unread comment indicator applies to any square, including solved ones
            var hasUnread = unreadCommentIds.indexOf(chalId) !== -1;
            var dot = btn.querySelector(".screenshot-comment-dot");
            if (hasUnread && !dot) {
                var span = document.createElement("span");
                span.className = "screenshot-comment-dot";
                span.innerHTML = '<i class="fas fa-comment"></i>';
                span.title = "New instructor comment - open the challenge to read it.";
                btn.classList.add("has-screenshot-indicator");
                btn.appendChild(span);
            } else if (!hasUnread && dot) {
                dot.remove();
                btn.classList.remove("has-screenshot-indicator");
            }

            if (btn.classList.contains("challenge-solved")) return;

            if (pendingIds.indexOf(chalId) !== -1) {
                btn.classList.add("challenge-pending");
                btn.classList.remove("challenge-rejected");
                btn.setAttribute("title", "Screenshot submitted - awaiting instructor review.");
                btn.setAttribute("aria-label", challengeName + ": screenshot submitted - awaiting instructor review.");
            } else if (rejectedIds.indexOf(chalId) !== -1) {
                btn.classList.add("challenge-rejected");
                btn.classList.remove("challenge-pending");
                btn.setAttribute("title", "Screenshot rejected - open challenge for instructor feedback and resubmit.");
                btn.setAttribute("aria-label", challengeName + ": screenshot rejected - open challenge for instructor feedback and resubmit.");
            }
        });
    }

    // Called from view.js once the user has viewed the instructor feedback
    window.__markScreenshotCommentRead = function(challengeId) {
        challengeId = parseInt(challengeId, 10);
        var idx = unreadCommentIds.indexOf(challengeId);
        if (idx !== -1) {
            unreadCommentIds.splice(idx, 1);
        }
        document.querySelectorAll("button.challenge-button").forEach(function(btn) {
            if (parseInt(btn.getAttribute("value"), 10) !== challengeId) return;
            var dot = btn.querySelector(".screenshot-comment-dot");
            if (dot) dot.remove();
            btn.classList.remove("has-screenshot-indicator");
        });
    };

    var observing = false;
    function observeBoard() {
        if (observing) return;
        var target = document.getElementById("challenges") || document.body;
        var observer = new MutationObserver(function() {
            applyStyles();
        });
        observer.observe(target, { childList: true, subtree: true });
        observing = true;
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", fetchStatuses);
    } else {
        fetchStatuses();
    }
})();
