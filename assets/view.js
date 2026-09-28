CTFd._internal.challenge.data = undefined;
CTFd._internal.challenge.renderer = null;
CTFd._internal.challenge.preRender = function() {};
CTFd._internal.challenge.render = null;
CTFd._internal.challenge.postRender = function() {};

// Holds the currently selected/pasted blobs to upload
var MAX_SCREENSHOT_UPLOADS = 4;
var screenshotErrorTimeout = null;
window.__pendingScreenshots = [];

window.__showScreenshotError = function(message) {
  var errorEl = document.getElementById("screenshot-error");
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.style.display = "";
  if (screenshotErrorTimeout) {
    clearTimeout(screenshotErrorTimeout);
  }
  screenshotErrorTimeout = setTimeout(function() {
    errorEl.style.display = "none";
  }, 7000);
};

window.__openScreenshotLightbox = function(url) {
  var overlay = document.getElementById("screenshot-lightbox");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "screenshot-lightbox";
    overlay.tabIndex = -1;
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;" +
      "overflow:auto;outline:none;display:none;";
    overlay.innerHTML =
      // width:max-content lets the wrapper grow past the viewport when zoomed,
      // and margin:auto on the image centers without clipping the top/left edges
      '<div id="screenshot-lightbox-wrap" style="display:flex;min-width:100%;min-height:100%;' +
      'width:max-content;padding:24px;box-sizing:border-box;">' +
      '<img id="screenshot-lightbox-img" src="" alt="Screenshot preview" draggable="false" ' +
      'style="margin:auto;border-radius:4px;box-shadow:0 0 24px rgba(0,0,0,0.6);' +
      'cursor:zoom-in;user-select:none;">' +
      '</div>' +
      '<button type="button" id="screenshot-lightbox-close" aria-label="Close preview" ' +
      'style="position:fixed;top:12px;right:16px;z-index:2;background:rgba(0,0,0,0.55);color:#fff;' +
      'border:1px solid rgba(255,255,255,0.4);border-radius:50%;width:36px;height:36px;' +
      'font-size:1rem;line-height:1;cursor:pointer;">&#10005;</button>' +
      '<div style="position:fixed;bottom:12px;left:0;right:0;text-align:center;' +
      'color:rgba(255,255,255,0.75);font-size:0.85rem;pointer-events:none;z-index:2;">' +
      'Click image to zoom &middot; scroll, arrow keys or drag to pan &middot; Esc to close</div>';
    document.body.appendChild(overlay);

    var img = overlay.querySelector("#screenshot-lightbox-img");
    var wrap = overlay.querySelector("#screenshot-lightbox-wrap");
    var zoomed = false;
    var dragging = false;
    var dragMoved = false;
    var dragStartX = 0, dragStartY = 0, scrollStartX = 0, scrollStartY = 0;

    function setFit() {
      zoomed = false;
      img.style.width = "";
      img.style.height = "";
      img.style.maxWidth = "calc(100vw - 48px)";
      img.style.maxHeight = "calc(100vh - 48px)";
      img.style.cursor = "zoom-in";
    }

    function closeLightbox() {
      overlay.style.display = "none";
    }

    function zoomAt(clientX, clientY) {
      // Where on the image was clicked, as a 0..1 ratio
      var rect = img.getBoundingClientRect();
      var rx = rect.width ? (clientX - rect.left) / rect.width : 0.5;
      var ry = rect.height ? (clientY - rect.top) / rect.height : 0.5;

      zoomed = true;
      // Zoom to natural (1:1) size, or 2x if the image already fits at full size
      var targetWidth = img.naturalWidth > rect.width ? img.naturalWidth : rect.width * 2;
      img.style.maxWidth = "none";
      img.style.maxHeight = "none";
      img.style.width = targetWidth + "px";
      img.style.height = "auto";
      img.style.cursor = "zoom-out";

      // Scroll so the clicked point stays under the cursor
      var newRect = img.getBoundingClientRect();
      overlay.scrollLeft += (newRect.left + rx * newRect.width) - clientX;
      overlay.scrollTop += (newRect.top + ry * newRect.height) - clientY;
    }

    img.addEventListener("click", function(e) {
      e.stopPropagation();
      if (dragMoved) {
        dragMoved = false;
        return;
      }
      if (zoomed) {
        setFit();
        overlay.scrollLeft = 0;
        overlay.scrollTop = 0;
      } else {
        zoomAt(e.clientX, e.clientY);
      }
    });

    // Drag to pan while zoomed
    img.addEventListener("pointerdown", function(e) {
      if (!zoomed) return;
      dragging = true;
      dragMoved = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      scrollStartX = overlay.scrollLeft;
      scrollStartY = overlay.scrollTop;
      img.setPointerCapture(e.pointerId);
      img.style.cursor = "grabbing";
      e.preventDefault();
    });
    img.addEventListener("pointermove", function(e) {
      if (!dragging) return;
      var dx = e.clientX - dragStartX;
      var dy = e.clientY - dragStartY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
      overlay.scrollLeft = scrollStartX - dx;
      overlay.scrollTop = scrollStartY - dy;
    });
    img.addEventListener("pointerup", function(e) {
      if (!dragging) return;
      dragging = false;
      img.releasePointerCapture(e.pointerId);
      img.style.cursor = zoomed ? "zoom-out" : "zoom-in";
    });

    // Click on the dark backdrop closes; click on the image only toggles zoom
    wrap.addEventListener("click", function(e) {
      if (e.target === wrap) closeLightbox();
    });
    overlay.querySelector("#screenshot-lightbox-close").addEventListener("click", closeLightbox);

    // Capture phase so Esc closes only the lightbox, not the challenge modal behind it
    document.addEventListener("keydown", function(e) {
      if (overlay.style.display === "none") return;
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        closeLightbox();
      }
    }, true);

    overlay.__reset = function() {
      setFit();
      overlay.scrollLeft = 0;
      overlay.scrollTop = 0;
    };
  }
  overlay.querySelector("#screenshot-lightbox-img").src = url;
  overlay.__reset();
  overlay.style.display = "block";
  // Focus the overlay so arrow keys / PageUp / PageDown scroll it natively
  overlay.focus();
};

function __mySubmissionThumbs(data, centered) {
  var files = data.files || [];
  var html = "";
  if (files.length > 0) {
    html += '<div class="mt-2">' +
      '<div class="small text-uppercase fw-bold font-weight-bold mb-1">Your last submission</div>' +
      '<div class="d-flex flex-wrap gap-2' + (centered ? ' justify-content-center' : '') + '">';
    files.forEach(function(f) {
      var url = "/plugins/screenshot_challenges/my-files/" + parseInt(f.id, 10);
      html += '<img src="' + url + '" alt="Your submitted screenshot" title="Click to preview" ' +
        'class="border rounded bg-white" ' +
        'style="width:72px;height:72px;object-fit:cover;cursor:zoom-in;" ' +
        'onclick="window.__openScreenshotLightbox(this.src)">';
    });
    html += '</div></div>';
  }
  if (data.missing_files) {
    html += '<div class="small text-muted mt-1">Some submitted image(s) are no longer available.</div>';
  }
  return html;
}

window.__loadScreenshotStatus = function(challengeId) {
  var banner = document.getElementById("screenshot-status-banner");
  if (!banner || !challengeId) return;

  fetch("/plugins/screenshot_challenges/api/my-status/" + challengeId, {
    credentials: "same-origin"
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (!data.status) return;

    // The server marks comments as read when my-status is fetched;
    // update the board square indicator to match.
    if (data.review_comment && window.__markScreenshotCommentRead) {
      window.__markScreenshotCommentRead(challengeId);
    }

    if (data.status === "pending") {
      banner.innerHTML = '<div class="alert alert-warning text-center mb-2 py-2">' +
        '<i class="fas fa-clock"></i> Your screenshot is awaiting instructor review.' +
        __mySubmissionThumbs(data, true) +
        '</div>';
    } else if (data.status === "rejected") {
      var feedback = data.review_comment ?
        escapeHtml(data.review_comment) :
        '<span class="text-muted">No additional feedback was provided.</span>';
      var msg = '<div class="alert alert-danger mb-3 py-3 text-start text-left" role="alert">' +
        '<div class="fw-bold font-weight-bold mb-2"><i class="fas fa-times-circle"></i> Your screenshot submission was rejected.</div>' +
        '<div class="mb-2">Review the instructor feedback below, then upload a corrected screenshot.</div>' +
        '<div class="border rounded bg-light text-dark p-2">' +
        '<div class="small text-uppercase fw-bold font-weight-bold text-danger mb-1">Instructor feedback</div>' +
        '<div>' + feedback + '</div>' +
        '</div>';
      if (data.review_comment) {
        msg += '<div class="small mt-2 text-danger">This is why the submission did not pass review.</div>';
      }
      msg += __mySubmissionThumbs(data, false);
      msg += '</div>';
      banner.innerHTML = msg;
    } else if (data.status === "approved" && (data.review_comment || (data.files && data.files.length))) {
      var approvedMsg = '<div class="alert alert-success mb-3 py-3 text-start text-left" role="alert">' +
        '<div class="fw-bold font-weight-bold mb-2"><i class="fas fa-check-circle"></i> Your screenshot submission was approved.</div>';
      if (data.review_comment) {
        approvedMsg += '<div class="border rounded bg-light text-dark p-2">' +
          '<div class="small text-uppercase fw-bold font-weight-bold text-success mb-1">Instructor feedback</div>' +
          '<div>' + escapeHtml(data.review_comment) + '</div>' +
          '</div>';
      }
      approvedMsg += __mySubmissionThumbs(data, false);
      approvedMsg += '</div>';
      banner.innerHTML = approvedMsg;
    }
  })
  .catch(function() {});
};

function __setScreenshot(blob, name) {
  window.__pendingScreenshots.push({
    blob: blob,
    name: name || "screenshot.png",
    url: URL.createObjectURL(blob),
    size: blob.size,
  });
  __updateScreenshotPreview();
}

function __updateScreenshotPreview() {
  var wrapper = document.getElementById("screenshot-preview-wrapper");
  var list = document.getElementById("screenshot-preview-list");
  if (!wrapper || !list) return;

  list.innerHTML = "";
  if (window.__pendingScreenshots.length === 0) {
    wrapper.style.display = "none";
    return;
  }

  wrapper.style.display = "";
  window.__pendingScreenshots.forEach(function(item, index) {
    var row = document.createElement("div");
    row.className = "d-flex align-items-center justify-content-between gap-2 p-2 border rounded";
    row.innerHTML =
      '<img src="' + item.url + '" alt="Screenshot preview" title="Click to preview" ' +
      'style="width:64px;height:64px;object-fit:cover;border-radius:4px;flex-shrink:0;cursor:zoom-in;" ' +
      'class="border" onclick="window.__openScreenshotLightbox(this.src)">' +
      '<div class="text-truncate flex-grow-1" style="min-width:0;">' +
      '<div class="small fw-bold" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
      escapeHtml(item.name) + '</div>' +
      '<div class="small text-muted">' + formatBytes(item.size) + '</div>' +
      '</div>' +
      '<button type="button" class="btn btn-sm btn-outline-danger" onclick="window.__removeScreenshot(' + index + ')">' +
      '<i class="fas fa-times"></i></button>';
    list.appendChild(row);
  });
}

function escapeHtml(text) {
  var div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  var units = ["B", "KB", "MB"];
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}

window.__clearScreenshot = function() {
  window.__pendingScreenshots.forEach(function(item) {
    if (item.url) URL.revokeObjectURL(item.url);
  });
  window.__pendingScreenshots = [];
  var fileInput = document.getElementById("screenshot-file");
  if (fileInput) fileInput.value = "";
  __updateScreenshotPreview();
  var errorEl = document.getElementById("screenshot-error");
  if (errorEl) {
    errorEl.style.display = "none";
  }
};

window.__removeScreenshot = function(index) {
  var item = window.__pendingScreenshots[index];
  if (item && item.url) {
    URL.revokeObjectURL(item.url);
  }
  window.__pendingScreenshots.splice(index, 1);
  __updateScreenshotPreview();
};

window.__handleFileSelect = function(event) {
  var files = event.target.files;
  if (!files) return;
  if (window.__pendingScreenshots.length + files.length > MAX_SCREENSHOT_UPLOADS) {
    __showScreenshotError("You may upload up to " + MAX_SCREENSHOT_UPLOADS + " images.");
    return;
  }
  for (var i = 0; i < files.length; i++) {
    __setScreenshot(files[i], files[i].name);
  }
};

window.__initScreenshotPaste = function() {
  // Avoid double-binding if the modal is reopened
  if (window.__pasteHandlerAttached) return;
  window.__pasteHandlerAttached = true;

  document.addEventListener("paste", function(e) {
    // Only handle paste when the screenshot challenge modal is open and visible
    var pasteZone = document.getElementById("screenshot-paste-zone");
    if (!pasteZone) return;
    // Ignore paste targeted at editable text fields (e.g., comment textarea)
    var target = e.target;
    if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" && target.type !== "file")) {
      // Allow paste only if it's the paste zone itself or no items are images
      if (target.id !== "screenshot-paste-zone") return;
    }

    var items = (e.clipboardData || e.originalEvent.clipboardData || {}).items;
    if (!items) return;

    var pasted = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf("image") === 0) {
        var blob = items[i].getAsFile();
        if (blob) {
          pasted.push(blob);
        }
      }
    }
    if (pasted.length > 0) {
      if (window.__pendingScreenshots.length + pasted.length > MAX_SCREENSHOT_UPLOADS) {
        __showScreenshotError("You may upload up to " + MAX_SCREENSHOT_UPLOADS + " images.");
        return;
      }
      e.preventDefault();
      pasted.forEach(function(blob, index) {
        var ext = (blob.type.split("/")[1] || "png").split("+")[0];
        var name = "pasted-screenshot-" + Date.now() + "-" + (index + 1) + "." + ext;
        __setScreenshot(blob, name);
      });
    }
  });
};

window.__screenshotSubmit = function(challengeId) {
  challengeId = parseInt(challengeId);

  if (!challengeId) {
    return Promise.resolve({
      data: {
        status: "incorrect",
        message: "Missing challenge ID. Please try reopening the challenge."
      }
    });
  }

  var files = [];
  if (window.__pendingScreenshots.length > 0) {
    files = window.__pendingScreenshots.slice();
  } else {
    var fileInput = document.getElementById("screenshot-file");
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      for (var i = 0; i < fileInput.files.length; i++) {
        files.push({ blob: fileInput.files[i], name: fileInput.files[i].name });
      }
    }
  }

  if (files.length === 0) {
    return Promise.resolve({
      data: {
        status: "incorrect",
        message: "Please paste or select one or more screenshots to upload."
      }
    });
  }
  if (files.length > MAX_SCREENSHOT_UPLOADS) {
    return Promise.resolve({
      data: {
        status: "incorrect",
        message: "You may upload up to " + MAX_SCREENSHOT_UPLOADS + " images."
      }
    });
  }

  var formData = new FormData();
  files.forEach(function(item) {
    formData.append("file", item.blob, item.name);
  });
  formData.append("challenge_id", challengeId);
  formData.append("nonce", CTFd.config.csrfNonce);

  return fetch(CTFd.config.urlRoot + "/plugins/screenshot_challenges/submit", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "CSRF-Token": CTFd.config.csrfNonce
    },
    body: formData
  }).then(function(response) {
    return response.json();
  }).then(function(data) {
    window.__clearScreenshot();
    // Show the just-uploaded images in the status banner right away
    if (data && data.data && data.data.status === "paused") {
      window.__loadScreenshotStatus(challengeId);
    }
    return data;
  });
};

CTFd._internal.challenge.submit = function(preview) {
  var challengeId = parseInt(CTFd.lib.$("#challenge-id").val());
  return window.__screenshotSubmit(challengeId);
};
