// Hassan Tsuma — portfolio: nav toggle, scroll reveal, contact form.
(function () {
  "use strict";

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
    window.addEventListener("scroll", function () {
      if (!ticking) {
        window.requestAnimationFrame(updateProgress);
        ticking = true;
      }
    }, { passive: true });
    window.addEventListener("resize", updateProgress);
  }

  // ---- stat count-up ----
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var countEls = document.querySelectorAll("[data-count]");
  function animateCount(el) {
    var target = parseInt(el.getAttribute("data-count"), 10) || 0;
    var suffix = el.getAttribute("data-suffix") || "";
    if (reduceMotion) {
      el.textContent = target + suffix;
      return;
    }
    var start = null;
    var duration = 900;
    function step(ts) {
      if (start === null) start = ts;
      var progress = Math.min(1, (ts - start) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target) + suffix;
      if (progress < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window && countEls.length) {
    var countIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          countIo.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    countEls.forEach(function (el) { countIo.observe(el); });
  } else {
    countEls.forEach(function (el) {
      var target = parseInt(el.getAttribute("data-count"), 10) || 0;
      el.textContent = target + (el.getAttribute("data-suffix") || "");
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
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }

  // ---- contact form (Artifact db capability, with graceful fallback) ----
  var form = document.getElementById("contact-form");
  if (!form) return;

  var statusEl = document.getElementById("contact-status");
  var submitBtn = form.querySelector("button[type='submit']");

  function showStatus(kind, text) {
    statusEl.hidden = false;
    statusEl.className = "form-msg " + kind;
    statusEl.textContent = text;
  }

  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    statusEl.hidden = true;

    var name = form.elements["name"].value.trim();
    var email = form.elements["email"].value.trim();
    var project = form.elements["project"].value.trim();
    var details = form.elements["details"].value.trim();

    if (!name || !email || !details) {
      showStatus("error", "Please fill in your name, email, and a short description — those three are required.");
      return;
    }
    if (!isValidEmail(email)) {
      showStatus("error", "That email address doesn't look right — double-check it.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    function openMailFallback() {
      var subject = "Portfolio contact" + (project ? " — " + project : "");
      var bodyLines = [
        "Name: " + name,
        "Email: " + email,
        project ? "Company or project: " + project : null,
        "",
        details
      ].filter(function (l) { return l !== null; });
      var mailto =
        "mailto:tsumaengineer03@gmail.com" +
        "?subject=" + encodeURIComponent(subject) +
        "&body=" + encodeURIComponent(bodyLines.join("\n"));
      window.location.href = mailto;
      form.reset();
      showStatus("success", "Opening your email app with your message filled in — just hit send from there.");
    }

    try {
      var db = window.claude && window.claude.use ? await window.claude.use("db") : null;
      if (!db) throw new Error("no-db");

      await db.collection("messages").add({
        name: name,
        email: email,
        project: project,
        details: details,
        submittedAt: new Date().toISOString()
      });

      form.reset();
      showStatus("success", "Sent — thank you. I read every message myself and reply from " + "tsumaengineer03@gmail.com" + ", usually within a couple of days.");
    } catch (err) {
      openMailFallback();
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send message";
    }
  });
})();
