// Rellena los enlaces de contacto con el correo de listas.json (el mismo que usa la app).
(function () {
  fetch("listas.json", { cache: "no-cache" })
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      var correo = cfg && cfg.contacto && cfg.contacto.correo;
      if (!correo) return;
      document.querySelectorAll("[data-correo]").forEach(function (el) {
        el.textContent = correo;
        el.href = "mailto:" + correo;
        el.parentElement.hidden = false;
      });
    })
    .catch(function () {});
})();
