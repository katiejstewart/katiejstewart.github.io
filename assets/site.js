/* ==========================================================================
   Katie Stewart — katiejstewart.github.io
   Interaction layer. No dependencies, no build step.

   Everything is additive: the page is fully readable and complete with this
   file blocked. Nothing here creates, removes, or rewrites copy — the scramble
   effect restores the exact original string, and every reveal starts from
   markup that is already in the document.
   ========================================================================== */

(function () {
  "use strict";

  var root = document.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ------------------------------------------------------------------------
     Theme
     The stored choice is applied by a tiny inline script in <head> so the page
     never paints the wrong palette first. This only wires up the button.
     ---------------------------------------------------------------------- */

  function currentTheme() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function applyTheme(name) {
    if (name === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    try { localStorage.setItem("theme", name); } catch (e) {}
    var btn = document.querySelector(".theme-toggle");
    if (btn) btn.setAttribute("aria-label", name === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }

  var toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    applyTheme(currentTheme());
    toggle.addEventListener("click", function () {
      applyTheme(currentTheme() === "dark" ? "light" : "dark");
    });
  }

  /* ------------------------------------------------------------------------
     Scroll reveal
     Sections rise a little as they enter. Anything already on screen at load
     is shown immediately so the first paint is never half empty.
     ---------------------------------------------------------------------- */

  var revealTargets = [].slice.call(document.querySelectorAll("[data-reveal]"));

  function showReveal(el) {
    var delay = parseInt(el.getAttribute("data-reveal-delay") || "0", 10);
    if (!delay) { el.classList.add("shown"); return; }
    setTimeout(function () { el.classList.add("shown"); }, delay);
  }

  if (!revealTargets.length) {
    /* nothing to do */
  } else if (reduced) {
    revealTargets.forEach(function (el) { el.classList.add("shown"); });
  } else {
    /* A measured scroll sweep rather than IntersectionObserver. Reveals hide
       real copy, so this path has to work even where an observer never fires;
       an unmeasurable viewport reveals everything instead of risking a blank
       page. */
    var pending = revealTargets.slice();
    var ticking = false;

    function sweep() {
      var vh = window.innerHeight || document.documentElement.clientHeight || 0;
      var remaining = [];

      for (var i = 0; i < pending.length; i++) {
        var el = pending[i];
        var r = el.getBoundingClientRect();
        if (!vh || (r.top < vh * 0.94 && r.bottom > 0)) showReveal(el);
        else remaining.push(el);
      }

      pending = remaining;

      if (!pending.length) {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      }
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; sweep(); });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    sweep();

    /* Failsafe: if the sweep never managed to show anything, the environment
       is not one we can measure — drop the effect rather than hide the page. */
    setTimeout(function () {
      if (!document.querySelector("[data-reveal].shown")) {
        revealTargets.forEach(function (el) { el.classList.add("shown"); });
        pending = [];
      }
    }, 2500);
  }

  /* ------------------------------------------------------------------------
     Text scramble
     Runs on the mono uppercase labels only — they are fixed-width, so the
     line never reflows while it settles. The original string is captured up
     front and written back at the end, character for character.
     ---------------------------------------------------------------------- */

  var GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/·—";

  function scramble(el, duration) {
    if (reduced) return;
    var original = el.getAttribute("data-text") || el.textContent;
    el.setAttribute("data-text", original);
    if (el._scrambling) return;
    el._scrambling = true;

    /* requestAnimationFrame is suspended in background tabs, which would strand
       the label mid-scramble forever. setTimeout still fires (throttled), so it
       is the guarantee that the real text always comes back. */
    clearTimeout(el._scrambleTimer);
    el._scrambleTimer = setTimeout(function () {
      el.textContent = original;
      el._scrambling = false;
    }, duration + 300);

    var chars = original.split("");
    var start = performance.now();
    var settleAt = chars.map(function (_, i) {
      return duration * (0.25 + 0.75 * (i / Math.max(chars.length - 1, 1)));
    });

    function frame(now) {
      var elapsed = now - start;
      var out = "";
      var done = true;

      for (var i = 0; i < chars.length; i++) {
        var ch = chars[i];
        if (ch === " " || elapsed >= settleAt[i]) {
          out += ch;
        } else {
          done = false;
          out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
      }

      el.textContent = out;

      if (done) {
        clearTimeout(el._scrambleTimer);
        el.textContent = original;   // exact restore, always
        el._scrambling = false;
        return;
      }
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  var scrambleTargets = [].slice.call(
    document.querySelectorAll(".eyebrow, .role-meta, .booking-label, .build-card-head span")
  );

  scrambleTargets.forEach(function (el) {
    el.setAttribute("data-text", el.textContent);
    if (finePointer) {
      el.addEventListener("mouseenter", function () { scramble(el, 420); });
    }
  });

  /* Scramble the section eyebrows once, as they scroll in. */
  if (!reduced && "IntersectionObserver" in window) {
    var scrambleObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        scramble(entry.target, 620);
        scrambleObserver.unobserve(entry.target);
      });
    }, { threshold: 0.6 });

    document.querySelectorAll(".eyebrow").forEach(function (el) {
      scrambleObserver.observe(el);
    });
  }

  /* ------------------------------------------------------------------------
     Stat count-up (Work page)
     Parses "50+", "~70%", "20", "100+" into prefix / number / suffix so the
     punctuation and hedges in the copy survive exactly as written.
     ---------------------------------------------------------------------- */

  var stats = [].slice.call(document.querySelectorAll(".stat strong"));
  stats.forEach(function (el) { el.setAttribute("data-full", el.textContent); });

  if (stats.length && !reduced && "IntersectionObserver" in window) {
    var statObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        countUp(entry.target);
        statObserver.unobserve(entry.target);
      });
    }, { threshold: 0.5 });

    stats.forEach(function (el) { statObserver.observe(el); });
  }

  function countUp(el) {
    var full = el.getAttribute("data-full") || el.textContent;
    var match = full.match(/^(\D*)(\d+)(\D*)$/);
    if (!match) return;

    var prefix = match[1];
    var target = parseInt(match[2], 10);
    var suffix = match[3];
    var duration = 1100;
    var start = performance.now();

    /* Same background-tab guarantee as the scramble. A counter frozen partway
       would leave a wrong number standing in for a real metric. */
    clearTimeout(el._countTimer);
    el._countTimer = setTimeout(function () { el.textContent = full; }, duration + 300);

    function frame(now) {
      var t = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = prefix + Math.round(target * eased) + suffix;
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        clearTimeout(el._countTimer);
        el.textContent = full;   // exact restore
      }
    }

    el.textContent = prefix + "0" + suffix;
    requestAnimationFrame(frame);
  }

  /* Belt and braces: leaving or returning to the tab restores every label and
     figure to its authored value immediately. */
  document.addEventListener("visibilitychange", function () {
    document.querySelectorAll("[data-text]").forEach(function (el) {
      if (!el._scrambling) return;
      clearTimeout(el._scrambleTimer);
      el.textContent = el.getAttribute("data-text");
      el._scrambling = false;
    });
    document.querySelectorAll(".stat strong[data-full]").forEach(function (el) {
      clearTimeout(el._countTimer);
      el.textContent = el.getAttribute("data-full");
    });
  });

  /* ------------------------------------------------------------------------
     Magnetic buttons
     The home button row leans toward the pointer, then springs back.
     ---------------------------------------------------------------------- */

  if (finePointer && !reduced) {
    document.querySelectorAll(".btn").forEach(function (btn) {
      var strength = 0.22;

      btn.addEventListener("mousemove", function (e) {
        var r = btn.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        btn.style.transform = "translate(" + dx * strength + "px," + dy * strength + "px)";
      });

      btn.addEventListener("mouseleave", function () {
        btn.style.transition = "transform 420ms cubic-bezier(0.22, 1.2, 0.36, 1)";
        btn.style.transform = "";
        setTimeout(function () { btn.style.transition = ""; }, 440);
      });
    });
  }

  /* ------------------------------------------------------------------------
     Custom cursor
     A small filled square with a ring that lags behind it. The ring opens over
     links and becomes a caret over running text, so it still reads as a
     pointer rather than decoration.
     ---------------------------------------------------------------------- */

  if (finePointer && !reduced) {
    var dot = document.createElement("div");
    var ring = document.createElement("div");
    dot.className = "cursor-dot";
    ring.className = "cursor-ring";
    document.body.appendChild(dot);
    document.body.appendChild(ring);
    root.classList.add("cursor-on");

    var mx = window.innerWidth / 2, my = window.innerHeight / 2;
    var rx = mx, ry = my;

    window.addEventListener("mousemove", function (e) {
      mx = e.clientX;
      my = e.clientY;

      var el = e.target;
      var overLink = !!(el.closest && el.closest("a, button"));
      var overText = !overLink && !!(el.closest && el.closest("p, h1, h2, h3, .fact-value, figcaption"));

      ring.classList.toggle("is-link", overLink);
      ring.classList.toggle("is-text", overText);
      dot.classList.toggle("is-text", overText);
    }, { passive: true });

    document.addEventListener("mouseleave", function () {
      dot.style.opacity = "0";
      ring.style.opacity = "0";
    });

    document.addEventListener("mouseenter", function () {
      dot.style.opacity = "";
      ring.style.opacity = "";
    });

    (function cursorLoop() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      dot.style.transform = "translate(" + mx + "px," + my + "px)";
      ring.style.transform = "translate(" + rx + "px," + ry + "px)";
      requestAnimationFrame(cursorLoop);
    })();
  }

  /* ------------------------------------------------------------------------
     Ambient background field
     Slow concentric rings and a sparse node lattice, drawn in the ink colour
     at very low alpha so it never competes with the copy. Parallaxes slightly
     with the pointer. Skipped on small screens, on reduced motion, and while
     the tab is hidden.
     ---------------------------------------------------------------------- */

  /* Some embedded/headless viewports report 0 before first layout. Treat an
     unknown width as "wide enough" rather than silently dropping the effect. */
  function viewportWidth() {
    return window.innerWidth || document.documentElement.clientWidth || 1024;
  }

  if (!reduced && viewportWidth() > 760) {
    var canvas = document.createElement("canvas");
    canvas.id = "ambient";
    canvas.setAttribute("aria-hidden", "true");
    document.body.insertBefore(canvas, document.body.firstChild);

    var ctx = canvas.getContext("2d");
    var w = 0, h = 0, dpr = 1;
    var clusters = [];
    var nodes = [];
    var px = 0, py = 0, tx = 0, ty = 0;
    var running = true;

    function inkStroke(alpha) {
      var dark = root.getAttribute("data-theme") === "dark";
      return dark
        ? "oklch(0.95 0.012 60 / " + alpha + ")"
        : "oklch(0.22 0.03 20 / " + alpha + ")";
    }

    function roseStroke(alpha) {
      var dark = root.getAttribute("data-theme") === "dark";
      return dark
        ? "oklch(0.72 0.16 12 / " + alpha + ")"
        : "oklch(0.55 0.17 12 / " + alpha + ")";
    }

    function seed() {
      clusters = [];
      nodes = [];

      var clusterCount = Math.max(3, Math.round(w / 520));
      for (var i = 0; i < clusterCount; i++) {
        clusters.push({
          x: Math.random() * w,
          y: Math.random() * h,
          rings: 3 + ((Math.random() * 3) | 0),
          gap: 26 + Math.random() * 30,
          phase: Math.random() * Math.PI * 2,
          speed: 0.00016 + Math.random() * 0.00022,
          depth: 0.4 + Math.random() * 0.9
        });
      }

      var nodeCount = Math.max(10, Math.round(w / 68));
      for (var j = 0; j < nodeCount; j++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.09,
          vy: (Math.random() - 0.5) * 0.09,
          depth: 0.3 + Math.random() * 1.1
        });
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = viewportWidth();
      h = window.innerHeight || document.documentElement.clientHeight || 768;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    window.addEventListener("mousemove", function (e) {
      tx = (e.clientX / w - 0.5) * 26;
      ty = (e.clientY / h - 0.5) * 26;
    }, { passive: true });

    document.addEventListener("visibilitychange", function () {
      var wasRunning = running;
      running = !document.hidden;
      if (running && !wasRunning) {
        draw();                       // repaint at once
        requestAnimationFrame(draw);  // then resume the loop
      }
    });

    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 180);
    });

    function draw(now) {
      if (!running) return;
      if (typeof now !== "number") now = performance.now();

      px += (tx - px) * 0.05;
      py += (ty - py) * 0.05;

      ctx.clearRect(0, 0, w, h);

      /* concentric rings */
      for (var i = 0; i < clusters.length; i++) {
        var c = clusters[i];
        var breathe = Math.sin(now * c.speed + c.phase);
        var cx = c.x + px * c.depth;
        var cy = c.y + py * c.depth;

        for (var r = 1; r <= c.rings; r++) {
          var radius = c.gap * r + breathe * 7;
          if (radius <= 0) continue;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.strokeStyle = inkStroke((0.075 - r * 0.009).toFixed(4));
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(cx, cy, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = roseStroke(0.22);
        ctx.fill();
      }

      /* drifting node lattice */
      for (var n = 0; n < nodes.length; n++) {
        var p = nodes[n];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -40) p.x = w + 40;
        if (p.x > w + 40) p.x = -40;
        if (p.y < -40) p.y = h + 40;
        if (p.y > h + 40) p.y = -40;
      }

      for (var a = 0; a < nodes.length; a++) {
        var na = nodes[a];
        var ax = na.x + px * na.depth;
        var ay = na.y + py * na.depth;

        for (var b = a + 1; b < nodes.length; b++) {
          var nb = nodes[b];
          var bx = nb.x + px * nb.depth;
          var by = nb.y + py * nb.depth;
          var dx = ax - bx;
          var dy = ay - by;
          var dist2 = dx * dx + dy * dy;

          if (dist2 < 24000) {
            var alpha = (1 - dist2 / 24000) * 0.085;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.strokeStyle = inkStroke(alpha.toFixed(4));
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }

        ctx.beginPath();
        ctx.arc(ax, ay, 1.1, 0, Math.PI * 2);
        ctx.fillStyle = inkStroke(0.16);
        ctx.fill();
      }

      requestAnimationFrame(draw);
    }

    resize();
    draw();                    // paint once synchronously, so the field exists
    requestAnimationFrame(draw);
    setTimeout(function () { canvas.classList.add("on"); }, 60);
  }
})();
