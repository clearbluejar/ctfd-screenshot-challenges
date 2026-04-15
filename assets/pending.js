(function() {
    var pendingIds = [];

    function fetchPending() {
        fetch("/plugins/screenshot_challenges/api/my-pending", { credentials: "same-origin" })
            .then(function(r) {
                if (!r.ok) return { data: [] };
                return r.json();
            })
            .then(function(result) {
                pendingIds = result.data || [];
                if (pendingIds.length > 0) {
                    applyPendingStyles();
                    observeBoard();
                }
            })
            .catch(function() {});
    }

    function applyPendingStyles() {
        var buttons = document.querySelectorAll("button.challenge-button");
        buttons.forEach(function(btn) {
            var chalId = parseInt(btn.getAttribute("value"), 10);
            if (pendingIds.indexOf(chalId) !== -1) {
                if (!btn.classList.contains("challenge-solved")) {
                    btn.classList.add("challenge-pending");
                }
            }
        });
    }

    var observing = false;
    function observeBoard() {
        if (observing) return;
        var target = document.getElementById("challenges") || document.body;
        var observer = new MutationObserver(function() {
            applyPendingStyles();
        });
        observer.observe(target, { childList: true, subtree: true });
        observing = true;
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", fetchPending);
    } else {
        fetchPending();
    }
})();
