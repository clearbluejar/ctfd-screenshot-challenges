var challengeFilterPopulated = false;

function loadReviews() {
    var status = document.getElementById("status-filter").value;
    var challengeId = document.getElementById("challenge-filter").value;

    var url = "/plugins/screenshot_challenges/api/reviews?status=" + encodeURIComponent(status);
    if (challengeId) {
        url += "&challenge_id=" + encodeURIComponent(challengeId);
    }

    fetch(url, { credentials: "same-origin" })
        .then(function(r) { return r.json(); })
        .then(function(result) {
            renderReviews(result.data, status);
            document.getElementById("review-count").textContent = result.data.length + " submission(s)";

            if (!challengeFilterPopulated && result.challenges) {
                var sel = document.getElementById("challenge-filter");
                result.challenges.forEach(function(c) {
                    var opt = document.createElement("option");
                    opt.value = c.id;
                    opt.textContent = (c.category ? c.category + " / " : "") + c.name;
                    sel.appendChild(opt);
                });
                challengeFilterPopulated = true;
            }
        })
        .catch(function(err) {
            document.getElementById("reviews-container").innerHTML =
                '<div class="col-12"><div class="alert alert-danger">Failed to load reviews: ' + err.message + '</div></div>';
        });
}

function renderReviews(submissions, status) {
    var container = document.getElementById("reviews-container");

    if (submissions.length === 0) {
        container.innerHTML = '<div class="col-12 text-center py-5 text-muted"><h4>No submissions found</h4></div>';
        return;
    }

    // Group by challenge
    var groups = {};
    var groupOrder = [];
    submissions.forEach(function(ss) {
        var key = ss.challenge_id;
        if (!groups[key]) {
            groups[key] = {
                challenge_id: ss.challenge_id,
                challenge_name: ss.challenge_name,
                challenge_category: ss.challenge_category || "",
                challenge_description: ss.challenge_description || "",
                submissions: []
            };
            groupOrder.push(key);
        }
        groups[key].submissions.push(ss);
    });

    // Sort groups by category then name
    groupOrder.sort(function(a, b) {
        var ga = groups[a], gb = groups[b];
        var catCmp = ga.challenge_category.localeCompare(gb.challenge_category);
        if (catCmp !== 0) return catCmp;
        return ga.challenge_name.localeCompare(gb.challenge_name);
    });

    var html = "";
    var isPending = status === "pending";

    groupOrder.forEach(function(key) {
        var group = groups[key];
        var pendingIds = [];
        group.submissions.forEach(function(ss) {
            if (ss.status === "pending") pendingIds.push(ss.id);
        });

        // Challenge group header
        html += '<div class="col-12 mb-4">';
        html += '<div class="card">';
        html += '<div class="card-header bg-secondary text-white">';
        html += '<div class="d-flex justify-content-between align-items-center">';
        html += '<div>';
        if (group.challenge_category) {
            html += '<span class="badge bg-light text-dark me-2">' + escapeHtml(group.challenge_category) + '</span>';
        }
        html += '<strong>' + escapeHtml(group.challenge_name) + '</strong>';
        html += '<span class="ms-2 badge bg-info">' + group.submissions.length + ' submission(s)</span>';
        html += '</div>';
        if (isPending && pendingIds.length > 1) {
            html += '<button class="btn btn-success btn-sm" onclick="batchApprove([' + pendingIds.join(",") + '])">';
            html += '<i class="fas fa-check-double"></i> Approve All (' + pendingIds.length + ')</button>';
        }
        html += '</div>';

        // Description
        if (group.challenge_description) {
            html += '<div class="mt-2 small text-light" style="opacity:0.85;">' + escapeHtml(group.challenge_description) + '</div>';
        }
        html += '</div>';

        // Submissions in this group
        html += '<div class="card-body"><div class="row g-3">';
        group.submissions.forEach(function(ss) {
            var imgUrl = "/plugins/screenshot_challenges/files/" + ss.file_location;
            html += '<div class="col-12 col-md-6 col-xl-4">';
            html += '<div class="card h-100 review-card" id="review-' + ss.id + '">';
            html += '<div class="card-body">';

            // User + status
            html += '<div class="d-flex justify-content-between align-items-start mb-2">';
            html += '<h6 class="mb-0"><i class="fas fa-user"></i> ' + escapeHtml(ss.user_name);
            if (ss.team_name) html += ' <small class="text-muted">(' + escapeHtml(ss.team_name) + ')</small>';
            html += '</h6>';
            html += '<span class="badge bg-' + getBadgeColor(ss.status) + '">' + ss.status.toUpperCase() + '</span>';
            html += '</div>';

            // Thumbnail
            html += '<div class="text-center my-2">';
            html += '<img src="' + imgUrl + '" class="screenshot-thumb" ';
            html += 'onclick="showFullImage(\'' + imgUrl + '\', \'' + escapeHtml(ss.challenge_name) + ' - ' + escapeHtml(ss.user_name) + '\')" ';
            html += 'onerror="this.style.display=\'none\'">';
            html += '</div>';

            // Date
            html += '<p class="text-muted small mb-1"><i class="far fa-clock"></i> ' + formatDate(ss.date) + '</p>';

            // Review info
            if (ss.reviewer) {
                html += '<p class="text-muted small mb-1"><i class="fas fa-user-check"></i> ' + escapeHtml(ss.reviewer) + ' - ' + formatDate(ss.review_date) + '</p>';
            }
            if (ss.review_comment) {
                html += '<p class="small mb-1"><strong>Comment:</strong> ' + escapeHtml(ss.review_comment) + '</p>';
            }

            // Actions for pending
            if (ss.status === "pending") {
                html += '<hr class="my-2">';
                html += '<textarea class="form-control form-control-sm mb-2" id="comment-' + ss.id + '" rows="1" placeholder="Comment (optional)"></textarea>';
                html += '<div class="d-flex gap-2">';
                html += '<button class="btn btn-success btn-sm flex-fill" onclick="approveReview(' + ss.id + ')">';
                html += '<i class="fas fa-check"></i> Approve</button>';
                html += '<button class="btn btn-danger btn-sm flex-fill" onclick="rejectReview(' + ss.id + ')">';
                html += '<i class="fas fa-times"></i> Reject</button>';
                html += '</div>';
            }

            html += '</div></div></div>';
        });
        html += '</div></div>';
        html += '</div></div>';
    });

    container.innerHTML = html;
}

function approveReview(id) {
    var commentEl = document.getElementById("comment-" + id);
    var comment = commentEl ? commentEl.value : "";
    fetch("/plugins/screenshot_challenges/api/reviews/" + id + "/approve", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "CSRF-Token": CSRF_NONCE },
        body: JSON.stringify({ comment: comment })
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
        if (result.success) {
            var card = document.getElementById("review-" + id);
            if (card) card.classList.add("processed");
            setTimeout(loadReviews, 300);
        } else {
            alert("Error: " + result.message);
        }
    })
    .catch(function(err) { alert("Error: " + err.message); });
}

function rejectReview(id) {
    var commentEl = document.getElementById("comment-" + id);
    var comment = commentEl ? commentEl.value : "";
    fetch("/plugins/screenshot_challenges/api/reviews/" + id + "/reject", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "CSRF-Token": CSRF_NONCE },
        body: JSON.stringify({ comment: comment })
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
        if (result.success) {
            var card = document.getElementById("review-" + id);
            if (card) card.classList.add("processed");
            setTimeout(loadReviews, 300);
        } else {
            alert("Error: " + result.message);
        }
    })
    .catch(function(err) { alert("Error: " + err.message); });
}

function batchApprove(ids) {
    if (!confirm("Approve all " + ids.length + " submissions in this challenge?")) return;

    var done = 0;
    var errors = [];

    ids.forEach(function(id) {
        fetch("/plugins/screenshot_challenges/api/reviews/" + id + "/approve", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", "CSRF-Token": CSRF_NONCE },
            body: JSON.stringify({ comment: "Batch approved" })
        })
        .then(function(r) { return r.json(); })
        .then(function(result) {
            if (!result.success) errors.push(result.message);
            done++;
            if (done === ids.length) {
                if (errors.length > 0) alert("Some errors:\n" + errors.join("\n"));
                loadReviews();
            }
        })
        .catch(function(err) {
            errors.push(err.message);
            done++;
            if (done === ids.length) {
                if (errors.length > 0) alert("Some errors:\n" + errors.join("\n"));
                loadReviews();
            }
        });
    });
}

function showFullImage(url, title) {
    document.getElementById("modal-image").src = url;
    document.getElementById("imageModalLabel").textContent = title;
    var modal = new bootstrap.Modal(document.getElementById("imageModal"));
    modal.show();
}

function getBadgeColor(status) {
    switch(status) {
        case "pending": return "warning";
        case "approved": return "success";
        case "rejected": return "danger";
        default: return "secondary";
    }
}

function formatDate(isoString) {
    if (!isoString) return "N/A";
    var d = new Date(isoString);
    return d.toLocaleString();
}

function escapeHtml(text) {
    if (!text) return "";
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// --- Tab switching ---
function showTab(tab) {
    document.getElementById("reviews-panel").style.display = tab === "reviews" ? "" : "none";
    document.getElementById("gallery-panel").style.display = tab === "gallery" ? "" : "none";
    document.getElementById("tab-reviews").classList.toggle("active", tab === "reviews");
    document.getElementById("tab-gallery").classList.toggle("active", tab === "gallery");
    document.querySelector(".filter-bar").style.display = tab === "reviews" ? "" : "none";
    if (tab === "gallery") {
        loadStorageStats();
        loadGallery();
    }
}

// --- Storage stats ---
function loadStorageStats() {
    fetch("/plugins/screenshot_challenges/api/storage", { credentials: "same-origin" })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var html = '<div class="row text-center">';
            html += '<div class="col-md-3"><h4>' + formatSize(data.total_size) + '</h4><small class="text-muted">Total Size</small></div>';
            html += '<div class="col-md-3"><h4>' + data.file_count + '</h4><small class="text-muted">Files</small></div>';
            html += '<div class="col-md-2"><span class="badge bg-warning">' + formatSize(data.by_status.pending) + '</span><br><small>Pending</small></div>';
            html += '<div class="col-md-2"><span class="badge bg-success">' + formatSize(data.by_status.approved) + '</span><br><small>Approved</small></div>';
            html += '<div class="col-md-2"><span class="badge bg-danger">' + formatSize(data.by_status.rejected) + '</span><br><small>Rejected</small></div>';
            html += '</div>';
            document.getElementById("storage-stats").innerHTML = html;
        });
}

function formatSize(bytes) {
    if (bytes === 0) return "0 B";
    var units = ["B", "KB", "MB", "GB"];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}

// --- Gallery ---
function loadGallery() {
    var status = document.getElementById("gallery-status-filter").value;
    var url = "/plugins/screenshot_challenges/api/reviews?status=" + encodeURIComponent(status);

    fetch(url, { credentials: "same-origin" })
        .then(function(r) { return r.json(); })
        .then(function(result) { renderGallery(result.data); });
}

function renderGallery(submissions) {
    var container = document.getElementById("gallery-container");
    if (submissions.length === 0) {
        container.innerHTML = '<div class="col-12 text-center py-5 text-muted"><h5>No files found</h5></div>';
        return;
    }

    var html = "";
    submissions.forEach(function(ss) {
        if (!ss.file_location) return;
        var imgUrl = "/plugins/screenshot_challenges/files/" + ss.file_location;
        var canDelete = ss.status !== "pending";

        html += '<div class="col-6 col-md-4 col-lg-3 col-xl-2">';
        html += '<div class="card h-100">';
        html += '<img src="' + imgUrl + '" class="card-img-top" style="height:120px;object-fit:cover;cursor:pointer;" ';
        html += 'onclick="showFullImage(\'' + imgUrl + '\', \'' + escapeHtml(ss.challenge_name) + ' - ' + escapeHtml(ss.user_name) + '\')" ';
        html += 'onerror="this.style.display=\'none\'">';
        html += '<div class="card-body p-2">';
        html += '<small class="d-block text-truncate" title="' + escapeHtml(ss.challenge_name) + '">' + escapeHtml(ss.challenge_name) + '</small>';
        html += '<small class="text-muted d-block text-truncate">' + escapeHtml(ss.user_name) + '</small>';
        html += '<span class="badge bg-' + getBadgeColor(ss.status) + ' mt-1">' + ss.status + '</span>';
        if (canDelete) {
            html += '<div class="form-check mt-1"><input class="form-check-input gallery-check" type="checkbox" value="' + ss.id + '" onchange="updateDeleteBtn()"></div>';
        }
        html += '</div></div></div>';
    });

    container.innerHTML = html;
    updateDeleteBtn();
}

function toggleSelectAll() {
    var checked = document.getElementById("select-all-gallery").checked;
    document.querySelectorAll(".gallery-check").forEach(function(cb) { cb.checked = checked; });
    updateDeleteBtn();
}

function updateDeleteBtn() {
    var checked = document.querySelectorAll(".gallery-check:checked");
    var btn = document.getElementById("delete-selected-btn");
    btn.disabled = checked.length === 0;
    btn.textContent = checked.length > 0 ? "Delete Selected (" + checked.length + ")" : "Delete Selected Files";
}

function deleteSelected() {
    var ids = [];
    document.querySelectorAll(".gallery-check:checked").forEach(function(cb) {
        ids.push(parseInt(cb.value));
    });
    if (ids.length === 0) return;
    if (!confirm("Delete " + ids.length + " file(s) from disk? This cannot be undone.")) return;

    fetch("/plugins/screenshot_challenges/api/bulk-delete", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "CSRF-Token": CSRF_NONCE },
        body: JSON.stringify({ ids: ids })
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
        alert(result.message);
        document.getElementById("select-all-gallery").checked = false;
        loadStorageStats();
        loadGallery();
    })
    .catch(function(err) { alert("Error: " + err.message); });
}

// --- Init ---
document.getElementById("status-filter").addEventListener("change", loadReviews);
document.getElementById("challenge-filter").addEventListener("change", loadReviews);

loadReviews();
