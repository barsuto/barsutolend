/* =====================================================
   TARAS · VIDEO INTENSIVE — behaviour
   1) Smart glass header (shrinks + brightens on scroll)
   2) Liquid glass pointer tracking (--mx/--my on every .glass)
   3) Subtle 3D tilt on [data-glass-tilt] elements
   4) Reveal-on-scroll for the lesson timeline
   No dependencies — vanilla JS, works on any static host.
   ===================================================== */

(function () {
  "use strict";

  /* ---------- 1) smart header ---------- */
  var nav = document.getElementById("nav");

  function updateNavTheme() {
    if (!nav) return;
    var probeY = nav.getBoundingClientRect().height + 2;
    var probeX = window.innerWidth / 2;
    var el = document.elementFromPoint(probeX, probeY);
    var themedEl = el ? el.closest("[data-theme]") : null;
    var theme = themedEl ? themedEl.getAttribute("data-theme") : "light";
    nav.setAttribute("data-theme", theme);
  }

  function updateNav() {
    if (!nav) return;
    if (window.scrollY > 12) nav.classList.add("is-scrolled");
    else nav.classList.remove("is-scrolled");
    updateNavTheme();
  }
  document.addEventListener("scroll", updateNav, { passive: true });
  window.addEventListener("resize", updateNav);
  updateNav();

  /* ---------- 2 & 3) liquid glass pointer tracking + tilt ---------- */
  var glassEls = Array.prototype.slice.call(document.querySelectorAll(".glass"));
  var tiltEls = Array.prototype.slice.call(document.querySelectorAll("[data-glass-tilt]"));
  var ticking = false;
  var pointer = { x: null, y: null };

  function applyGlass(el, clientX, clientY, applyTilt) {
    var rect = el.getBoundingClientRect();
    var px = ((clientX - rect.left) / rect.width) * 100;
    var py = ((clientY - rect.top) / rect.height) * 100;
    px = Math.max(0, Math.min(100, px));
    py = Math.max(0, Math.min(100, py));
    el.style.setProperty("--mx", px + "%");
    el.style.setProperty("--my", py + "%");

    /* skip the 3D rotate on continuous input (device tilt): a transform
       that never settles trips a Safari bug where the blurred glass-shine
       leaks past its rounded-corner clip as a square ghost. */
    if (applyTilt !== false && el.hasAttribute("data-glass-tilt")) {
      var rx = ((py - 50) / 50) * -6; // rotateX
      var ry = ((px - 50) / 50) * 6;  // rotateY
      el.style.setProperty("--rx", rx.toFixed(2) + "deg");
      el.style.setProperty("--ry", ry.toFixed(2) + "deg");
    }
  }

  function frame(applyTilt) {
    ticking = false;
    if (pointer.x === null) return;
    glassEls.forEach(function (el) {
      var rect = el.getBoundingClientRect();
      var near =
        pointer.x > rect.left - 60 &&
        pointer.x < rect.right + 60 &&
        pointer.y > rect.top - 60 &&
        pointer.y < rect.bottom + 60;
      if (near) applyGlass(el, pointer.x, pointer.y, applyTilt);
    });
  }

  function onPointerMove(e) {
    var p = e.touches ? e.touches[0] : e;
    pointer.x = p.clientX;
    pointer.y = p.clientY;
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(frame);
    }
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("touchmove", onPointerMove, { passive: true });

  /* reset tilt when the pointer leaves a tilt element */
  tiltEls.forEach(function (el) {
    el.addEventListener("pointerleave", function () {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    });
  });

  /* ---------- device-tilt glass shimmer (rotate the phone to move the shine) ---------- */
  var tiltBaseline = null;

  function onDeviceOrientation(e) {
    if (e.beta === null || e.gamma === null) return;
    if (!tiltBaseline) tiltBaseline = { beta: e.beta, gamma: e.gamma };

    var dGamma = Math.max(-45, Math.min(45, e.gamma - tiltBaseline.gamma));
    var dBeta = Math.max(-45, Math.min(45, e.beta - tiltBaseline.beta));

    pointer.x = window.innerWidth / 2 + (dGamma / 45) * (window.innerWidth / 2);
    pointer.y = window.innerHeight / 2 + (dBeta / 45) * (window.innerHeight / 2);

    if (!ticking) {
      ticking = true;
      requestAnimationFrame(function () {
        frame(false);
      });
    }
  }

  function enableDeviceTilt() {
    window.addEventListener("deviceorientation", onDeviceOrientation);
  }

  var tiltBtn = document.getElementById("tilt-enable");

  if (window.DeviceOrientationEvent) {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      /* iOS: motion access can only be granted from a direct tap on a real control */
      if (tiltBtn) {
        tiltBtn.hidden = false;
        tiltBtn.addEventListener("click", function () {
          DeviceOrientationEvent.requestPermission()
            .then(function (state) {
              if (state === "granted") enableDeviceTilt();
            })
            .catch(function () {})
            .then(function () {
              tiltBtn.hidden = true;
            });
        });
      }
    } else {
      enableDeviceTilt();
    }
  }

  /* ---------- 5) portfolio: lazy-load + play-on-view video ---------- */
  var lazyVideoEls = Array.prototype.slice.call(document.querySelectorAll(".lazy-video"));
  if ("IntersectionObserver" in window && lazyVideoEls.length) {
    var videoIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var wrap = entry.target;
          var video = wrap.querySelector("video");

          if (entry.isIntersecting) {
            if (!video) {
              var src = wrap.getAttribute("data-src");
              var srcWebm = wrap.getAttribute("data-src-webm");
              var poster = wrap.getAttribute("data-poster");
              if (!src) return; // заглушка ще без реального відео — нічого не робимо

              video = document.createElement("video");
              video.muted = true;
              video.loop = true;
              video.playsInline = true;
              video.preload = "metadata";
              if (poster) video.poster = poster;

              if (srcWebm) {
                var sourceWebm = document.createElement("source");
                sourceWebm.src = srcWebm;
                sourceWebm.type = "video/webm";
                video.appendChild(sourceWebm);
              }
              var sourceMp4 = document.createElement("source");
              sourceMp4.src = src;
              sourceMp4.type = "video/mp4";
              video.appendChild(sourceMp4);

              wrap.appendChild(video);
            }
            video.play().catch(function () {
              /* автоплей заблоковано браузером — не критично, покаже постер */
            });
          } else if (video) {
            video.pause();
          }
        });
      },
      { threshold: 0.35 }
    );
    lazyVideoEls.forEach(function (el) {
      videoIO.observe(el);
    });
  }

  /* ---------- 4) reveal lesson rows on scroll ---------- */
  var revealEls = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if ("IntersectionObserver" in window && revealEls.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("in-view");
    });
  }

  /* ---------- smooth-scroll for in-page anchor links (Safari fallback) ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (e) {
      var id = link.getAttribute("href");
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
})();
