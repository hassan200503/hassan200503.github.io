// Motion layer — Lenis smooth scroll + GSAP. Loaded after script.js / github.js.
(function () {
  "use strict";

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var root = document.documentElement;
  var hasGSAP = !!(window.gsap && window.ScrollTrigger);
  if (hasGSAP) root.classList.add("js-gsap");

  var canHover = !!(window.matchMedia && window.matchMedia("(hover: hover)").matches);
  // ---- Lenis smooth scroll ----
  var lenis = null;
  if (!reduceMotion && window.Lenis) {
    try {
      lenis = new window.Lenis({
        duration: 1.15,
        easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
        smoothWheel: true,
        smoothTouch: false
      });
      if (hasGSAP) {
        lenis.on("scroll", window.ScrollTrigger.update);
        window.gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
        window.gsap.ticker.lagSmoothing(0);
      } else {
        function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
        requestAnimationFrame(raf);
      }
    } catch (e) { lenis = null; }
  }
  if (hasGSAP) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    function revealEl(el) {
      window.gsap.fromTo(el,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.9, ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 86%", toggleActions: "play none none none" } });
    }
    window.gsap.utils.toArray(".reveal").forEach(revealEl);

    // split-text headings
    window.gsap.utils.toArray("[data-split]").forEach(function (el) {
      var text = el.textContent;
      el.innerHTML = text.split(/(\s+)/).map(function (w) {
        if (!w.trim()) return w;
        return '<span class="split-word"><span class="split-inner">' + w + "</span></span>";
      }).join("");
      var inners = el.querySelectorAll(".split-inner");
      window.gsap.fromTo(inners,
        { yPercent: 115 },
        { yPercent: 0, duration: 0.95, ease: "power4.out", stagger: 0.035,
          scrollTrigger: { trigger: el, start: "top 88%" } });
    });

    // parallax layers
    window.gsap.utils.toArray("[data-parallax]").forEach(function (el) {
      var speed = parseFloat(el.getAttribute("data-parallax")) || 0.2;
      window.gsap.to(el, {
        yPercent: speed * 100,
        ease: "none",
        scrollTrigger: { trigger: el.parentElement || el, start: "top bottom", end: "bottom top", scrub: true }
      });
    }); // override htReveal so dynamically added cards (GitHub) join the choreography
    window.htReveal = function (scope) {
      var nodes = (scope || document).querySelectorAll(".reveal:not(.is-visible)");
      nodes.forEach(function (el) { revealEl(el); });
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    };
  }

  // ---- magnetic buttons ----
  if (!reduceMotion && window.matchMedia && window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll("[data-magnetic]").forEach(function (btn) {
      btn.addEventListener("mousemove", function (e) {
        btn.style.transition = "none";
        var r = btn.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.28;
        var y = (e.clientY - r.top - r.height / 2) * 0.28;
        btn.style.transform = "translate(" + x + "px," + y + "px)";
      });
      btn.addEventListener("mouseleave", function () { btn.style.transition = ""; btn.style.transform = ""; });
    });
  }

  // ---- cursor glow ----
  if (!reduceMotion && window.matchMedia && window.matchMedia("(hover: hover)").matches) {
    var glow = document.createElement("div");
    glow.className = "cursor-glow";
    document.body.appendChild(glow);
    var gx = 0, gy = 0, tx = 0, ty = 0;
    window.addEventListener("mousemove", function (e) { tx = e.clientX; ty = e.clientY; }, { passive: true });
    function loop() {
      gx += (tx - gx) * 0.12;
      gy += (ty - gy) * 0.12;
      glow.style.transform = "translate(" + (gx - 200) + "px," + (gy - 200) + "px)";
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  } // ---- 3D tilt cards ----
  function tiltCard(card) {
    if (reduceMotion || !canHover) return;
    if (!card || card.__tilt) return;
    card.__tilt = true;
    if (!card.querySelector(".glare")) {
      var g = document.createElement("div");
      g.className = "glare";
      card.appendChild(g);
    }
    card.addEventListener("mousemove", function (e) {
      card.style.transition = "none";
      var r = card.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = "perspective(900px) rotateY(" + (x * 9) + "deg) rotateX(" + (-y * 9) + "deg)";
      var glare = card.querySelector(".glare");
      if (glare) {
        glare.style.opacity = "0.22";
        glare.style.background = "radial-gradient(circle at " + ((x + 0.5) * 100) + "% " + ((y + 0.5) * 100) + "%, rgba(255,255,255,0.45), transparent 60%)";
      }
    });
    card.addEventListener("mouseleave", function () {
      card.style.transition = "transform 280ms cubic-bezier(.2,.7,.2,1)";
      card.style.transform = "";
      var glare = card.querySelector(".glare");
      if (glare) glare.style.opacity = "0";
      setTimeout(function () { card.style.transition = ""; }, 300);
    });
  }
  window.htTilt = tiltCard;

  if (!reduceMotion && window.matchMedia && window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll("[data-tilt]").forEach(tiltCard);
  }
})();