CTFd._internal.challenge.data = undefined;
CTFd._internal.challenge.renderer = null;
CTFd._internal.challenge.preRender = function() {};
CTFd._internal.challenge.render = null;
CTFd._internal.challenge.postRender = function() {};

window.__screenshotSubmit = function(challengeId) {
  challengeId = parseInt(challengeId);
  var fileInput = document.getElementById("screenshot-file");

  if (!challengeId) {
    return Promise.resolve({
      data: {
        status: "incorrect",
        message: "Missing challenge ID. Please try reopening the challenge."
      }
    });
  }

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    return Promise.resolve({
      data: {
        status: "incorrect",
        message: "Please select a screenshot file to upload."
      }
    });
  }

  var formData = new FormData();
  formData.append("file", fileInput.files[0]);
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
    fileInput.value = "";
    return data;
  });
};

CTFd._internal.challenge.submit = function(preview) {
  var challengeId = parseInt(CTFd.lib.$("#challenge-id").val());
  return window.__screenshotSubmit(challengeId);
};
