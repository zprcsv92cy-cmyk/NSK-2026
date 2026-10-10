(function () {
  function wireLogin() {
    var btn =
      document.getElementById("loginBtn") ||
      document.getElementById("btnSendLink");

    var input =
      document.getElementById("emailInput") ||
      document.getElementById("email") ||
      document.getElementById("loginEmail");

    function doLogin() {
      var email = (input ? input.value : "").trim();
      if (!email) return;

      if (window.Auth && typeof window.Auth.login === "function") {
        window.Auth.login(email).catch(console.error);
      }
    }

    if (btn && !btn.dataset.boundLoginPatch) {
      btn.dataset.boundLoginPatch = "1";
      btn.addEventListener("click", doLogin);
    }

    if (input && !input.dataset.boundLoginPatch) {
      input.dataset.boundLoginPatch = "1";
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          doLogin();
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireLogin);
  } else {
    wireLogin();
  }
})();