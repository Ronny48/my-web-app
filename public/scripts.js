// Small script to toggle mobile navigation
(function () {
  // Mobile nav toggle
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("primary-navigation");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      const expanded = this.getAttribute("aria-expanded") === "true" || false;
      this.setAttribute("aria-expanded", !expanded);
      nav.classList.toggle("open");
      // animate hamburger
      this.classList.toggle("open");
    });
  }

  // Auto-focus first input in forms and add small animated feedback for notices
  document.addEventListener("DOMContentLoaded", function () {
    // autofocus
    const forms = document.querySelectorAll("form");
    forms.forEach((form) => {
      const first = form.querySelector(
        "input:not([type=hidden]), textarea, select"
      );
      if (first) first.focus();
    });

    // animate notices
    const notices = document.querySelectorAll(".notice");
    notices.forEach((n) => {
      n.classList.add("notice-enter");
      // remove after a few seconds
      setTimeout(() => n.classList.remove("notice-enter"), 2600);
      // allow click to dismiss
      n.addEventListener("click", () => n.remove());
      // allow Esc to close
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") n.remove();
      });
    });
  });
})();

// Theme switcher: apply and persist theme choice
(function () {
  const THEME_KEY = "site-theme";
  const select = document.getElementById("theme-select");

  function applyTheme(name) {
    document.documentElement.classList.remove(
      "theme-blue",
      "theme-warm",
      "theme-dark"
    );
    if (name) document.documentElement.classList.add(`theme-${name}`);
  }

  function getSystemPref() {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "blue";
  }

  // initialize
  try {
    const saved = localStorage.getItem(THEME_KEY);
    const initial = saved || getSystemPref();
    applyTheme(initial);
    if (select) select.value = initial;
  } catch (e) {
    // ignore storage errors
  }

  if (select) {
    select.addEventListener("change", function (e) {
      const val = e.target.value;
      try {
        localStorage.setItem(THEME_KEY, val);
      } catch (err) {}
      applyTheme(val);
    });
  }

  // respond to system changes
  if (window.matchMedia) {
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", (e) => {
        const saved = localStorage.getItem(THEME_KEY);
        if (!saved) applyTheme(e.matches ? "dark" : "blue");
      });
  }
})();
