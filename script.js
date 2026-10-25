// Hassan Tsuma — portfolio: theme, nav, scroll reveal, contact form.
(function () {
  "use strict";

  var EMAIL = "karungwahassan03@gmail.com";
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
  // Exposed as window.htReveal so content rendered after load — the GitHub
  // cards arrive from a fetch — joins the same choreography instead of
  // appearing fully formed while everything around it animates.
  var supportsIO = "IntersectionObserver" in window;
  var revealIo = null;

  if (supportsIO) {
    revealIo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealIo.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
  }

  window.htReveal = function (scope) {
    var nodes = (scope || document).querySelectorAll(".reveal:not(.is-visible)");
    nodes.forEach(function (el) {
      if (revealIo) revealIo.observe(el);
      else el.classList.add("is-visible");
    });
  };

  window.htReveal(document);

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

  // ---- local time (footer) — Homabay, Kenya, UTC+3 ----
  var timeEl = document.querySelector("[data-local-time]");
  if (timeEl) {
    function renderTime() {
      try {
        var fmt = new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Africa/Nairobi"
        });
        timeEl.textContent = fmt.format(new Date()) + " EAT";
      } catch (e) {
        timeEl.textContent = "UTC+3";
      }
    }
    renderTime();
    setInterval(renderTime, 15000);
  }

  // ---- contact form ----
  // Delivery: a form relay (FormSubmit) posts the message straight into
  // Hassan's Gmail. The relay needs a one-time activation — the very first
  // submission emails a confirmation link to that address. If the relay or
  // the network is unreachable, the form falls back to the visitor's mail
  // client, or to WhatsApp. Nothing gets posted into a silent void.
  var form = document.getElementById("contact-form");
  if (!form) return;

  var statusEl = document.getElementById("contact-status");
  var handoff = document.getElementById("contact-handoff");
  var waLink = document.getElementById("handoff-wa");
  var copyBtn = document.getElementById("handoff-copy");
  var submitBtn = form.querySelector('button[type="submit"]');
  var RELAY = "https://formsubmit.co/ajax/" + EMAIL;

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
    var honey = form.elements["_honey"] ? form.elements["_honey"].value : "";

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

    var subject = (kind ? kind : "Portfolio enquiry") + " - " + name;
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

    // Honeypot: bots that fill the hidden field get a quiet fake success.
    if (honey) {
      showStatus("success", "Sent — thank you. I'll get back to you the same day.");
      return;
    }

    // Give the visitor the routes that work no matter what happens next.
    if (waLink) {
      waLink.href = "https://wa.me/" + WA + "?text=" + encodeURIComponent(body);
    }
    if (copyBtn) {
      copyBtn.setAttribute("data-copy", body);
    }

    var btnLabel = submitBtn ? submitBtn.textContent : "";
    var busy = submitBtn !== null;
    if (busy) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
    }
    showStatus("pending", "Sending — one moment.");

    function resetButton() {
      if (!busy) return;
      submitBtn.disabled = false;
      submitBtn.textContent = btnLabel;
    }

    function fallbackToMailApp(reason) {
      // The relay can't be reached or refused the message. The honest path
      // left: put the finished message in the visitor's own mail client
      // addressed to Hassan, and offer the WhatsApp route beside it.
      window.location.href =
        "mailto:" +
        EMAIL +
        "?subject=" +
        encodeURIComponent(subject) +
        "&body=" +
        encodeURIComponent(body);
      if (handoff) handoff.hidden = false;
      showStatus(
        "success",
        "The direct send didn't go through" +
          (reason ? " (" + reason + ")" : "") +
          ", so your email app is opening with this message already written — send it from there. " +
          "WhatsApp works too."
      );
    }

    fetch(RELAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        _subject: subject,
        _template: "table",
        _captcha: "false",
        _replyto: email,
        name: name,
        email: email,
        project: project || "—",
        about: kind,
        message: details
      })
    })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (String((data && data.success) || "") !== "true") {
          throw new Error((data && data.message) || "relay refused");
        }
        showStatus(
          "success",
          "Sent — the message is in my Gmail inbox now. I usually reply the same day, to " +
            email +
            "."
        );
        if (handoff) handoff.hidden = true;
        form.reset();
      })
      .catch(function () {
        fallbackToMailApp();
      })
      .finally(resetButton);
  });
})();
