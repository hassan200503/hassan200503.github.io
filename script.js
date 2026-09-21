// Hassan Tsuma — portfolio: theme, nav, scroll reveal, contact form.
(function () {
  "use strict";

  var EMAIL = "tsumaengineer03@gmail.com";
  var WA = "254714931575";

  // ---- theme toggle ----
  // The early inline script in each page has already applied the stored
  // choice; this only wires the control and keeps the label truthful.
  var root = document.documentElement;
  var themeBtn = document.querySelector(".theme-toggle");

  function currentTheme() {
    var stored = root.getAttribute("data-theme");
    if (stored) return stored;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function labelTheme() {
    if (!themeBtn) return;
    var next = currentTheme() === "dark" ? "light" : "dark";
    themeBtn.setAttribute("aria-label", "Switch to " + next + " theme");
    themeBtn.setAttribute("title", "Switch to " + next + " theme");
  }

  if (themeBtn) {
    labelTheme();
    themeBtn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("ht-theme", next);
      } catch (e) {
        /* private mode / blocked storage — the choice just won't persist */
      }
      labelTheme();
    });
  }

  // ---- mobile nav ----
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.textContent = open ? "Close" : "Menu";
    });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.textContent = "Menu";
      });
    });
  }

  // ---- scroll progress rail ----
  var rail = document.querySelector(".progress-rail");
  if (rail) {
    var ticking = false;
    function updateProgress() {
      var doc = document.documentElement;
      var scrollable = doc.scrollHeight - doc.clientHeight;
      var pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
      rail.style.setProperty("--progress", Math.min(100, Math.max(0, pct)) + "%");
      ticking = false;
    }
    updateProgress();
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          window.requestAnimationFrame(updateProgress);
          ticking = true;
        }
      },
      { passive: true }
    );
    window.addEventListener("resize", updateProgress);
  }

  // ---- stat count-up ----
  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var countEls = document.querySelectorAll("[data-count]");
  function animateCount(el) {
    var target = parseInt(el.getAttribute("data-count"), 10) || 0;
    var suffix = el.getAttribute("data-suffix") || "";
    var sep = el.hasAttribute("data-sep");
    function render(n) {
      return (sep ? n.toLocaleString("en-US") : String(n)) + suffix;
    }
    if (reduceMotion) {
      el.textContent = render(target);
      return;
    }
    var start = null;
    var duration = 900;
    function step(ts) {
      if (start === null) start = ts;
      var progress = Math.min(1, (ts - start) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = render(Math.round(eased * target));
      if (progress < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window && countEls.length) {
    var countIo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            countIo.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    countEls.forEach(function (el) {
      countIo.observe(el);
    });
  } else {
    countEls.forEach(function (el) {
      var target = parseInt(el.getAttribute("data-count"), 10) || 0;
      var suffix = el.getAttribute("data-suffix") || "";
      el.textContent =
        (el.hasAttribute("data-sep") ? target.toLocaleString("en-US") : String(target)) + suffix;
    });
  }

  // ---- scroll reveal ----
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  // ---- copy-email buttons ----
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var value = btn.getAttribute("data-copy");
      var original = btn.getAttribute("data-label") || btn.textContent;
      function done(ok) {
        btn.textContent = ok ? "Copied ✓" : "Press Ctrl+C";
        window.setTimeout(function () {
          btn.textContent = original;
        }, 1800);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(
          function () {
            done(true);
          },
          function () {
            done(false);
          }
        );
      } else {
        done(false);
      }
    });
  });

  // ---- contact form ----
  // This site is static — there is no server to POST to, so the form's job
  // is to compose the message properly and hand it to a channel that does
  // deliver: the visitor's mail client, or WhatsApp. No silent black hole.
  var form = document.getElementById("contact-form");
  if (!form) return;

  var statusEl = document.getElementById("contact-status");
  var handoff = document.getElementById("contact-handoff");
  var waLink = document.getElementById("handoff-wa");
  var copyBtn = document.getElementById("handoff-copy");

  function showStatus(kind, text) {
    statusEl.hidden = false;
    statusEl.className = "form-msg " + kind;
    statusEl.textContent = text;
  }

  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    statusEl.hidden = true;
    if (handoff) handoff.hidden = true;

    var name = form.elements["name"].value.trim();
    var email = form.elements["email"].value.trim();
    var project = form.elements["project"].value.trim();
    var kind = form.elements["kind"] ? form.elements["kind"].value : "";
    var details = form.elements["details"].value.trim();

    if (!name || !email || !details) {
      showStatus(
        "error",
        "Please fill in your name, email, and a short description — those three are required."
      );
      return;
    }
    if (!isValidEmail(email)) {
      showStatus("error", "That email address doesn't look right — double-check it.");
      return;
    }

    var subject = (kind ? kind : "Portfolio enquiry") + " — " + name;
    var body = [
      "Name: " + name,
      "Email: " + email,
      project ? "Company or project: " + project : null,
      kind ? "About: " + kind : null,
      "",
      details
    ]
      .filter(function (l) {
        return l !== null;
      })
      .join("\n");

    // Give the visitor every route that actually works from a static page.
    if (waLink) {
      waLink.href = "https://wa.me/" + WA + "?text=" + encodeURIComponent(body);
    }
    if (copyBtn) {
      copyBtn.setAttribute("data-copy", body);
    }
    if (handoff) handoff.hidden = false;

    window.location.href =
      "mailto:" +
      EMAIL +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body);

    showStatus(
      "success",
      "Your email app should be opening with this message already written — send it from there. " +
        "If nothing opened, use one of the two buttons below instead."
    );
  });
})();
