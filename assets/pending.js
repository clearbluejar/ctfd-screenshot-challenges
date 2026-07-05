(function() {
    var pendingIds = [];
    var rejectedIds = [];

    function fetchStatuses() {
        fetch("/plugins/screenshot_challenges/api/my-pending", { credentials: "same-origin" })
            .then(function(r) {
                if (!r.ok) return { pending: [], rejected: [] };
                return r.json();
            })
            .then(function(result) {
                pendingIds = result.pending || [];
                rejectedIds = result.rejected || [];
                if (pendingIds.length > 0 || rejectedIds.length > 0) {
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
            if (btn.classList.contains("challenge-solved")) return;
            var challengeName = btn.textContent.trim() || "Challenge";

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
