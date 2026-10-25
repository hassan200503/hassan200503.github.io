// Motion layer v3 — Lenis smooth scroll + GSAP ScrollTrigger.
// Signature moves: fonts-gated hero line-mask intro, scrubbed exhibit
// images, velocity-skewed marquee, trailing cursor ring, magnetic
// buttons, refined tilt. Every effect is guarded: prefers-reduced-motion,
// touch devices, no-JS and CDN failure all degrade to the static design.
(function () {
  "use strict";

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fineHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var root = document.documentElement;
  var hasGSAP = !!(window.gsap && window.ScrollTrigger);
  if (hasGSAP) {
    root.classList.add("js-gsap");
    window.gsap.registerPlugin(window.ScrollTrigger);
    try { window.ScrollTrigger.config({ ignoreMobileResize: true }); } catch (e) {}
  }

  // ---- Lenis smooth scroll, synced to GSAP's clock ----
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
        (function raf(time) { lenis.raf(time); requestAnimationFrame(raf); })(performance.now());
      }
    } catch (e) { lenis = null; }
  }

  // ---- word splitter (mask reveals; keeps <em>/<i> accents alive) ----
  function splitIntoWords(el) {
    if (el.__split) return el.querySelectorAll(".split-inner");
    var out = [];
    var collect = function (node, isEm) {
      Array.prototype.forEach.call(node.childNodes, function (child) {
        if (child.nodeType === 3) {
          child.textContent.split(/(\s+)/).forEach(function (w) {
            if (w.trim()) {
              var tok = { w: w, em: isEm };
              // keep trailing punctuation attached to the word it belongs to
              if (out.length && /^[.,!?;:'"\u2019\u201d)\]]+/.test(w)) {
                out[out.length - 1].w += w;
              } else {
                out.push(tok);
              }
            }
          });
        } else if (child.nodeType === 1) {
          collect(child, isEm || child.tagName === "EM" || child.tagName === "I");
        }
      });
    };
    collect(el, false);
    el.textContent = "";
    out.forEach(function (part, i) {
      if (i > 0) el.appendChild(document.createTextNode(" "));
      var word = document.createElement("span");
      word.className = "split-word" + (part.em ? " is-em" : "");
      var inner = document.createElement("span");
      inner.className = "split-inner";
      inner.textContent = part.w;
      word.appendChild(inner);
      el.appendChild(word);
    });
    el.__split = true;
    return el.querySelectorAll(".split-inner");
  }
  window.htSplit = splitIntoWords;

  if (hasGSAP && !reduceMotion) {
    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;

    // ---- standard reveals ----
    function revealEl(el) {
      gsap.fromTo(el,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.95, ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 86%", toggleActions: "play none none none" } });
    }
    gsap.utils.toArray(".reveal").forEach(revealEl);
    window.htReveal = function (scope) {
      var nodes = (scope || document).querySelectorAll(".reveal:not(.is-visible)");
      nodes.forEach(revealEl);
      ScrollTrigger.refresh();
    };

    // ---- masked word reveals for section headings ----
    gsap.utils.toArray("[data-split]").forEach(function (el) {
      var inners = splitIntoWords(el);
      gsap.fromTo(inners,
        { yPercent: 115 },
        { yPercent: 0, duration: 1, ease: "expo.out", stagger: 0.04,
          scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none none" } });
    });

    // ---- parallax drifts ----
    gsap.utils.toArray("[data-parallax]").forEach(function (el) {
      var speed = parseFloat(el.getAttribute("data-parallax")) || 0.2;
      gsap.to(el, {
        yPercent: speed * 100,
        ease: "none",
        scrollTrigger: { trigger: el.parentElement || el, start: "top bottom", end: "bottom top", scrub: true }
      });
    });

    // ---- showcase exhibits: subtle scale + drift while they pass ----
    gsap.utils.toArray(".exhibit img").forEach(function (img) {
      var frame = img.closest(".exhibit") || img.parentElement;
      gsap.fromTo(img,
        { scale: 1.14, yPercent: -2.5 },
        { scale: 1.0, yPercent: 2.5, ease: "none",
          scrollTrigger: { trigger: frame, start: "top 92%", end: "bottom 30%", scrub: 0.6 } });
    });

    // ---- velocity-skewed marquee band ----
    var band = document.querySelector(".marquee-band");
    if (band) {
      var skew = 0, skewTarget = 0;
      ScrollTrigger.create({
        start: 0, end: "max",
        onUpdate: function (self) {
          skewTarget = gsap.utils.clamp(-4.5, 4.5, self.getVelocity() / -380);
        }
      });
      gsap.ticker.add(function () {
        skew += (skewTarget - skew) * 0.12;
        skewTarget *= 0.9;
        if (Math.abs(skew) > 0.01 || Math.abs(skewTarget) > 0.01) {
          band.style.transform = "skewX(" + skew.toFixed(3) + "deg)";
        } else if (band.style.transform) {
          band.style.transform = "";
        }
      });
    }

    // ---- hero intro: playwright's order, gated on fonts ----
    (function heroIntro() {
      var hero = document.querySelector(".hero");
      if (!hero) return;

      var title = hero.querySelector("[data-hero-split]");
      var titleInners = null;
      try {
        if (title) {
          titleInners = splitIntoWords(title);
          gsap.set(titleInners, { yPercent: 118 });
        }
      } catch (e) { titleInners = null; }

      var beats = hero.querySelectorAll(".rise:not(.eyebrow)");
      gsap.set(beats, { y: 20, opacity: 0 });

      function run() {
        try {
          var tl = gsap.timeline({ defaults: { ease: "power3.out" } });
          if (titleInners && titleInners.length) {
            tl.fromTo(titleInners,
              { yPercent: 118 },
              { yPercent: 0, duration: 1.15, ease: "expo.out", stagger: 0.05 }, 0.1);
          }
          tl.fromTo(".hero .eyebrow", { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 }, 0.02);
          tl.to(beats, { y: 0, opacity: 1, duration: 0.95, ease: "power3.out", stagger: 0.085 }, 0.34);
          tl.add(function () { ScrollTrigger.refresh(); });
        } catch (e) {
          gsap.set(beats, { clearProps: "all" });
          if (titleInners) gsap.set(titleInners, { clearProps: "all" });
        }
      }

      var started = false;
      function kick() { if (!started) { started = true; run(); } }
      try {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(kick, kick);
          setTimeout(kick, 650);
        } else { kick(); }
      } catch (e) { kick(); }
    })();

    // ---- trailing cursor ring (native cursor stays; the ring adds weight) ----
    if (fineHover) {
      var ring = document.createElement("div");
      ring.className = "cursor-ring";
      document.body.appendChild(ring);
      var seen = 0;
      var tx = 0, ty = 0, cx = 0, cy = 0, hot = 0, hotLerp = 0;
      window.addEventListener("mousemove", function (e) {
        tx = e.clientX; ty = e.clientY; seen = 1;
      }, { passive: true });
      document.addEventListener("mouseover", function (e) {
        hot = e.target.closest && e.target.closest("a, button, [data-magnetic], [data-tilt]") ? 1 : 0;
      }, { passive: true });
      gsap.ticker.add(function () {
        if (!seen) return;
        cx += (tx - cx) * 0.2;
        cy += (ty - cy) * 0.2;
        hotLerp += (hot - hotLerp) * 0.16;
        var s = 1 + hotLerp * 1.15;
        ring.style.opacity = String(Math.min(0.85, 0.24 + hotLerp * 0.55));
        ring.style.transform = "translate3d(" + (cx - 13) + "px," + (cy - 13) + "px,0) scale(" + s.toFixed(3) + ")";
      });
    }
  } else {
    // no GSAP (or reduced motion): keep the reveal hook contract intact
    window.htReveal = function (scope) {
      var nodes = (scope || document).querySelectorAll(".reveal:not(.is-visible)");
      nodes.forEach(function (el) { el.classList.add("is-visible"); });
    };
  }

  // ---- magnetic buttons: clamped pull, css transition handles the snap-back ----
  if (!reduceMotion && fineHover) {
    document.querySelectorAll("[data-magnetic]").forEach(function (btn) {
      btn.addEventListener("mousemove", function (e) {
        btn.style.transition = "none";
        var r = btn.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.3;
        var y = (e.clientY - r.top - r.height / 2) * 0.3;
        var pull = Math.hypot(x, y);
        if (pull > 26) { x *= 26 / pull; y *= 26 / pull; }
        btn.style.transform = "translate(" + x + "px," + y + "px)";
      });
      btn.addEventListener("mouseleave", function () {
        btn.style.transition = "";
        btn.style.transform = "";
      });
    });
  }

  // ---- 3D tilt cards (gentle, glare whisper-quiet) ----
  function tiltCard(card) {
    if (reduceMotion || !fineHover) return;
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
      card.style.transform =
        "perspective(950px) rotateY(" + (x * 7).toFixed(2) + "deg) rotateX(" + (-y * 7).toFixed(2) + "deg)";
      var glare = card.querySelector(".glare");
      if (glare) {
        glare.style.opacity = "0.20";
        glare.style.background =
          "radial-gradient(circle at " + ((x + 0.5) * 100).toFixed(1) + "% " + ((y + 0.5) * 100).toFixed(1) + "%, rgba(255,255,255,0.4), transparent 62%)";
      }
    });
    card.addEventListener("mouseleave", function () {
      card.style.transition = "transform 320ms cubic-bezier(.2,.7,.2,1)";
      card.style.transform = "";
      var glare = card.querySelector(".glare");
      if (glare) glare.style.opacity = "0";
      setTimeout(function () { card.style.transition = ""; }, 340);
    });
  }
  window.htTilt = tiltCard;

  if (!reduceMotion && fineHover) {
    document.querySelectorAll("[data-tilt]").forEach(tiltCard);
  }
})();
