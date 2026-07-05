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

window.__loadScreenshotStatus = function(challengeId) {
  var banner = document.getElementById("screenshot-status-banner");
  if (!banner || !challengeId) return;

  fetch("/plugins/screenshot_challenges/api/my-status/" + challengeId, {
    credentials: "same-origin"
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (!data.status) return;

    if (data.status === "pending") {
      banner.innerHTML = '<div class="alert alert-warning text-center mb-2 py-2">' +
        '<i class="fas fa-clock"></i> Your screenshot is awaiting instructor review.</div>';
    } else if (data.status === "rejected") {
      var msg = '<div class="alert alert-danger text-center mb-2 py-2">' +
        '<i class="fas fa-times-circle"></i> <strong>Submission rejected.</strong>';
      if (data.review_comment) {
        var div = document.createElement("div");
        div.textContent = data.review_comment;
        msg += '<br><small>"' + div.innerHTML + '"</small>';
      }
      msg += '<br><small>Please upload a new screenshot below.</small></div>';
      banner.innerHTML = msg;
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
      '<div class="text-truncate" style="min-width:0;">' +
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
    return data;
  });
};

CTFd._internal.challenge.submit = function(preview) {
  var challengeId = parseInt(CTFd.lib.$("#challenge-id").val());
  return window.__screenshotSubmit(challengeId);
};
