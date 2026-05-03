CTFd._internal.challenge.data = undefined;
CTFd._internal.challenge.renderer = null;
CTFd._internal.challenge.preRender = function() {};
CTFd._internal.challenge.render = null;
CTFd._internal.challenge.postRender = function() {};

// Holds the currently selected/pasted blob to upload
window.__pendingScreenshot = null;

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
  window.__pendingScreenshot = { blob: blob, name: name || "screenshot.png" };

  var preview = document.getElementById("screenshot-preview");
  var wrapper = document.getElementById("screenshot-preview-wrapper");
  var nameEl = document.getElementById("screenshot-preview-name");
  var sizeEl = document.getElementById("screenshot-preview-size");

  if (preview) {
    preview.src = URL.createObjectURL(blob);
    if (wrapper) wrapper.style.display = "";
    if (nameEl) nameEl.textContent = name;
    if (sizeEl) sizeEl.textContent = formatBytes(blob.size);
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  var units = ["B", "KB", "MB"];
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}

window.__clearScreenshot = function() {
  window.__pendingScreenshot = null;
  var fileInput = document.getElementById("screenshot-file");
  if (fileInput) fileInput.value = "";
  var preview = document.getElementById("screenshot-preview");
  var wrapper = document.getElementById("screenshot-preview-wrapper");
  if (preview && preview.src) URL.revokeObjectURL(preview.src);
  if (wrapper) wrapper.style.display = "none";
};

window.__handleFileSelect = function(event) {
  var file = event.target.files && event.target.files[0];
  if (file) {
    __setScreenshot(file, file.name);
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

    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf("image") === 0) {
        var blob = items[i].getAsFile();
        if (blob) {
          e.preventDefault();
          var ext = (blob.type.split("/")[1] || "png").split("+")[0];
          var name = "pasted-screenshot-" + Date.now() + "." + ext;
          __setScreenshot(blob, name);
          return;
        }
      }
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

  // Prefer pasted/selected blob
  var blob = null;
  var name = "screenshot.png";
  if (window.__pendingScreenshot) {
    blob = window.__pendingScreenshot.blob;
    name = window.__pendingScreenshot.name;
  } else {
    var fileInput = document.getElementById("screenshot-file");
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      blob = fileInput.files[0];
      name = blob.name;
    }
  }

  if (!blob) {
    return Promise.resolve({
      data: {
        status: "incorrect",
        message: "Please paste or select a screenshot to upload."
      }
    });
  }

  var formData = new FormData();
  formData.append("file", blob, name);
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
