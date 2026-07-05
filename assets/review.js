var challengeFilterPopulated = false;
var currentImageUrl = null;
var currentDownloadFilename = null;
var imageGroups = {};
var currentImageGroupKey = null;
var currentImageIndex = 0;

function loadReviews() {
    var status = document.getElementById("status-filter").value;
    var challengeId = document.getElementById("challenge-filter").value;

    var url = "/plugins/screenshot_challenges/api/reviews?grouped=1&status=" + encodeURIComponent(status);
    if (challengeId) {
        url += "&challenge_id=" + encodeURIComponent(challengeId);
    }

    fetch(url, { credentials: "same-origin" })
        .then(function(r) { return r.json(); })
        .then(function(result) {
            renderReviews(result.data, status);
            document.getElementById("review-count").textContent = result.data.length + " review(s)";

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
            if (ss.status === "pending") {
                pendingIds.push(ss.id);
            }
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
        html += '<span class="ms-2 badge bg-info">' + group.submissions.length + ' review(s)</span>';
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
            var files = ss.files && ss.files.length ? ss.files : [{
                id: ss.id,
                file_location: ss.file_location,
                status: ss.status
            }];
            var imageGroupKey = "review-" + ss.id;
            imageGroups[imageGroupKey] = [];
            html += '<div class="col-12 col-md-6 col-xl-4">';
            html += '<div class="card h-100 review-card" id="review-' + ss.id + '">';
            html += '<div class="card-body">';

            // User + status
            html += '<div class="d-flex justify-content-between align-items-start mb-2">';
            html += '<h6 class="mb-0"><i class="fas fa-user"></i> ' + escapeHtml(ss.user_name);
            if (ss.team_name) html += ' <small class="text-muted">(' + escapeHtml(ss.team_name) + ')</small>';
            html += '</h6>';
            html += '<div class="text-end">';
            html += '<span class="badge bg-' + getBadgeColor(ss.status) + '">' + ss.status.toUpperCase() + '</span>';
            if (files.length > 1) {
                html += '<span class="badge bg-secondary ms-1">' + files.length + ' images</span>';
            }
            html += '</div>';
            html += '</div>';

            // Thumbnails (one review card can contain multiple uploaded images)
            html += '<div class="row g-2 my-2">';
            files.forEach(function(file, index) {
                if (!file.file_location) return;
                var imgUrl = "/plugins/screenshot_challenges/files/" + file.file_location;
                var imageTitle = ss.challenge_name + " - " + ss.user_name;
                if (files.length > 1) {
                    imageTitle += " (" + (index + 1) + "/" + files.length + ")";
                }
                html += '<div class="' + (files.length === 1 ? "col-12" : "col-6") + ' text-center" id="img-container-' + file.id + '">';
                var imageIndex = imageGroups[imageGroupKey].length;
                imageGroups[imageGroupKey].push({
                    url: imgUrl,
                    title: imageTitle,
                    reviewId: file.id
                });
                html += '<img src="' + htmlAttr(imgUrl) + '" class="screenshot-thumb" ';
                html += 'data-full-image-url="' + htmlAttr(imgUrl) + '" ';
                html += 'data-full-image-title="' + htmlAttr(imageTitle) + '" ';
                html += 'data-image-group-key="' + htmlAttr(imageGroupKey) + '" ';
                html += 'data-image-index="' + imageIndex + '" ';
                html += 'data-review-id="' + file.id + '">';
                if (files.length > 1) {
                    html += '<div class="small text-muted mt-1">Image ' + (index + 1) + '</div>';
                }
                html += '</div>';
            });
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
    bindImagePreviewClicks(container);
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
    if (!confirm("Approve all " + ids.length + " reviews in this challenge?")) return;

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

function handleImageLoadError(imgElement, reviewId, imgUrl) {
    imgElement.style.display = "none";
    var container = document.getElementById("img-container-" + reviewId);
    if (container && !container.querySelector(".image-load-error")) {
        var errorDiv = document.createElement("div");
        errorDiv.className = "image-load-error";
        errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i>' +
            '<div>Image failed to load</div>';

        var downloadButton = document.createElement("button");
        downloadButton.type = "button";
        downloadButton.className = "btn btn-sm btn-primary mt-2";
        downloadButton.innerHTML = '<i class="fas fa-download"></i> Download Original File';
        downloadButton.addEventListener("click", function() {
            downloadFile(imgUrl);
        });

        errorDiv.appendChild(downloadButton);
        container.appendChild(errorDiv);
    }
}

function downloadFile(url) {
    var link = document.createElement("a");
    link.href = url;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadCurrentImage() {
    if (currentImageUrl) {
        downloadFile(currentImageUrl);
    }
}

function showFullImage(url, title, reviewId) {
    var img = document.getElementById("modal-image");
    var wrapper = document.getElementById("modal-image-wrapper");
    img.src = url;
    img.style.width = "";
    img.style.height = "";
    if (wrapper) wrapper.classList.remove("zoomed");
    document.getElementById("imageModalLabel").textContent = title;
    currentImageUrl = url;
    currentDownloadFilename = title;

    if (wrapper) {
        wrapper.onclick = function() {
            if (wrapper.classList.contains("zoomed")) {
                wrapper.classList.remove("zoomed");
                img.style.width = "";
                img.style.height = "";
            } else {
                wrapper.classList.add("zoomed");
                var naturalWidth = img.naturalWidth;
                var displayWidth = img.clientWidth;
                if (naturalWidth > displayWidth) {
                    // Zoom to natural (1:1) size
                    img.style.width = naturalWidth + "px";
                    img.style.height = "auto";
                } else {
                    // Image already fits; zoom in by 2x
                    img.style.width = (displayWidth * 2) + "px";
                    img.style.height = "auto";
                }
            }
        };
    }

    updateModalNavigation();

    var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("imageModal"));
    modal.show();
}

function openImageGroup(groupKey, index) {
    currentImageGroupKey = groupKey;
    currentImageIndex = index || 0;
    showCurrentGroupImage();
}

function getCurrentImageGroup() {
    if (!currentImageGroupKey || !imageGroups[currentImageGroupKey]) {
        return [];
    }
    return imageGroups[currentImageGroupKey];
}

function showCurrentGroupImage() {
    var group = getCurrentImageGroup();
    if (!group.length) {
        return;
    }

    if (currentImageIndex < 0) {
        currentImageIndex = group.length - 1;
    } else if (currentImageIndex >= group.length) {
        currentImageIndex = 0;
    }

    var item = group[currentImageIndex];
    showFullImage(item.url, item.title, item.reviewId);
}

function showPreviousImage() {
    var group = getCurrentImageGroup();
    if (group.length < 2) {
        return;
    }

    currentImageIndex -= 1;
    showCurrentGroupImage();
}

function showNextImage() {
    var group = getCurrentImageGroup();
    if (group.length < 2) {
        return;
    }

    currentImageIndex += 1;
    showCurrentGroupImage();
}

function updateModalNavigation() {
    var group = getCurrentImageGroup();
    var prevBtn = document.getElementById("modal-prev-btn");
    var nextBtn = document.getElementById("modal-next-btn");
    var counter = document.getElementById("modal-image-counter");
    var hasMultiple = group.length > 1;

    if (prevBtn) prevBtn.disabled = !hasMultiple;
    if (nextBtn) nextBtn.disabled = !hasMultiple;
    if (counter) {
        counter.textContent = group.length ? (currentImageIndex + 1) + " / " + group.length : "";
    }
}

function handleImageModalKeydown(event) {
    var modal = document.getElementById("imageModal");
    if (!modal || !modal.classList.contains("show")) {
        return;
    }

    if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPreviousImage();
    } else if (event.key === "ArrowRight") {
        event.preventDefault();
        showNextImage();
    }
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

function htmlAttr(text) {
    return escapeHtml(String(text || ""));
}

function bindImagePreviewClicks(root) {
    root.querySelectorAll("img[data-full-image-url]").forEach(function(img) {
        img.addEventListener("click", function() {
            var groupKey = img.getAttribute("data-image-group-key");
            if (groupKey) {
                openImageGroup(groupKey, parseInt(img.getAttribute("data-image-index"), 10) || 0);
            } else {
                currentImageGroupKey = null;
                currentImageIndex = 0;
                showFullImage(
                    img.getAttribute("data-full-image-url"),
                    img.getAttribute("data-full-image-title") || "Screenshot",
                    parseInt(img.getAttribute("data-review-id"), 10)
                );
            }
        });
        img.addEventListener("error", function() {
            handleImageLoadError(
                img,
                parseInt(img.getAttribute("data-review-id"), 10),
                img.getAttribute("data-full-image-url")
            );
        }, { once: true });
    });
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
        var imageGroupKey = "gallery-" + ss.id;
        var canDelete = ss.status !== "pending";
        imageGroups[imageGroupKey] = [{
            url: imgUrl,
            title: ss.challenge_name + " - " + ss.user_name,
            reviewId: ss.id
        }];

        html += '<div class="col-6 col-md-4 col-lg-3 col-xl-2">';
        html += '<div class="card h-100">';
        html += '<img src="' + htmlAttr(imgUrl) + '" class="card-img-top" style="height:120px;object-fit:cover;cursor:pointer;" ';
        html += 'data-full-image-url="' + htmlAttr(imgUrl) + '" ';
        html += 'data-full-image-title="' + htmlAttr(ss.challenge_name + ' - ' + ss.user_name) + '" ';
        html += 'data-image-group-key="' + htmlAttr(imageGroupKey) + '" ';
        html += 'data-image-index="0" ';
        html += 'data-review-id="' + ss.id + '">';
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
    bindImagePreviewClicks(container);
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
document.addEventListener("keydown", handleImageModalKeydown);

loadReviews();
