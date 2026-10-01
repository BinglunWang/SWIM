
(function () {
  "use strict";

  var VIDEO_EXT = /\.(mp4|webm|ogg|mov)$/i;
  var cfg = window.SITE_CONFIG || {};

  var VIEWS = { top: 1, side: 1 };

  function currentView() {
    var v = document.documentElement.getAttribute("data-view");
    return VIEWS[v] ? v : "top";
  }

  function applyView(v, view) {
    var src = v.dataset["src" + (view === "side" ? "Side" : "Top")] || "";
    var poster = v.dataset["poster" + (view === "side" ? "Side" : "Top")] || "";
    if (v.src && v.getAttribute("src") === src) return;

    if (poster) v.poster = poster;
    v.setAttribute("src", src);
  }

  function setView(view) {
    if (!VIEWS[view]) view = "top";
    document.documentElement.setAttribute("data-view", view);
    try { localStorage.setItem("swim.view", view); } catch (e) {}
    Array.prototype.forEach.call(
      document.querySelectorAll(".view-toggle__btn"), function (b) {
        b.setAttribute("aria-pressed", b.dataset.view === view ? "true" : "false");
      });
    Array.prototype.forEach.call(document.querySelectorAll("video.media"), function (v) {
      if (v.dataset.srcTop || v.dataset.srcSide) applyView(v, view);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".gallery"), function (g) {
      var ar = g.dataset["ar" + (view === "side" ? "Side" : "Top")];
      if (ar) g.style.setProperty("--card-ar", ar);
    });
  }

  function initViewToggles() {
    var groups = document.querySelectorAll(".view-toggle");
    Array.prototype.forEach.call(groups, function (g) {
      g.hidden = false;
      var btns = g.querySelectorAll(".view-toggle__btn");
      Array.prototype.forEach.call(btns, function (b, i) {
        b.addEventListener("click", function () { setView(b.dataset.view); });
        b.addEventListener("keydown", function (e) {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          var next = btns[(i + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length];
          next.focus();
          setView(next.dataset.view);
        });
      });
    });
    setView(currentView());
  }

  function setupVideo(v, placeholderLabel) {
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "none";
    v.setAttribute("aria-label", placeholderLabel || "result video");
  }

  function toggleVideo(v) {
    v.paused ? v.play().catch(function () {}) : v.pause();
  }

  function media(item, placeholderLabel, attachVideoControls) {
    item = item || {};
    if (attachVideoControls !== false) attachVideoControls = true;
    var src = (item.src || "").trim();

    if (!src) {
      var ph = document.createElement("div");
      ph.className = "media-ph";
      ph.innerHTML =
        '<span class="media-ph__label"><b>' +
        (placeholderLabel || "Placeholder") +
        "</b><br>" + (item.placeholderText || "Add your image or video.") + "</span>";
      return ph;
    }

    if (VIDEO_EXT.test(src)) {
      var v = document.createElement("video");
      v.className = "media";

      v.dataset.srcTop = item.src || "";
      v.dataset.srcSide = item.sideSrc || "";
      v.dataset.posterTop = item.poster || "";
      v.dataset.posterSide = item.sidePoster || "";
      applyView(v, currentView());
      setupVideo(v, placeholderLabel);

      if (attachVideoControls) {
        v.addEventListener("mouseenter", function () { v.play().catch(function () {}); });
        v.addEventListener("mouseleave", function () { v.pause(); });
        v.addEventListener("click", function () { toggleVideo(v); });
      }
      return v;
    }

    var img = document.createElement("img");
    img.className = "media";
    img.src = src;
    img.alt = placeholderLabel || "figure";
    img.loading = "lazy";
    return img;
  }

  function cardName(item) {
    var parts = [];
    if (item.badge) parts.push(item.badge);
    if (item.title) parts.push(item.title);
    return parts.join(", ") || "result video";
  }

  function comparisonMedia(item) {
    var compareSrc = (item.compareSrc || "").trim();
    if (!compareSrc && !item.comparison) return media(item, cardName(item));

    var wrap = document.createElement("div");
    wrap.className = "compare";
    wrap.style.setProperty("--split", "50%");
    wrap.setAttribute("role", "slider");
    wrap.setAttribute("aria-label", cardName(item) + " comparison reveal");
    wrap.setAttribute("aria-valuemin", "0");
    wrap.setAttribute("aria-valuemax", "100");
    wrap.setAttribute("aria-valuenow", "50");
    wrap.tabIndex = 0;

    var bottom = document.createElement("div");
    bottom.className = "compare__layer compare__layer--bottom";
    bottom.appendChild(media({ src: compareSrc, poster: item.comparePoster, placeholderText: item.placeholderText }, item.compareLabel || "comparison video", false));

    var top = document.createElement("div");
    top.className = "compare__layer compare__layer--top";
    top.appendChild(media(item, item.label || cardName(item), false));

    var handle = document.createElement("div");
    handle.className = "compare__handle";
    handle.setAttribute("aria-hidden", "true");
    handle.innerHTML = '<span class="compare__knob"></span>';

    var leftLabel = document.createElement("span");
    leftLabel.className = "compare__label compare__label--left";
    leftLabel.textContent = item.label || "Prediction";

    var rightLabel = document.createElement("span");
    rightLabel.className = "compare__label compare__label--right";
    rightLabel.textContent = item.compareLabel || "Reference";

    wrap.appendChild(bottom);
    wrap.appendChild(top);
    wrap.appendChild(handle);
    wrap.appendChild(leftLabel);
    wrap.appendChild(rightLabel);

    function videos() {
      return Array.prototype.slice.call(wrap.querySelectorAll("video")).filter(function (v) {
        return v.getAttribute("src");
      });
    }

    function useSingleVideo() {
      var comparisonVideo = bottom.querySelector("video");
      wrap.classList.add("compare--single");
      wrap.removeAttribute("role");
      wrap.removeAttribute("aria-valuemin");
      wrap.removeAttribute("aria-valuemax");
      wrap.removeAttribute("aria-valuenow");
      if (comparisonVideo) {
        comparisonVideo.pause();
        comparisonVideo.removeAttribute("src");
        comparisonVideo.load();
      }
    }

    var isPlaying = false;

    function setPlaying(play) {
      isPlaying = play;
      videos().forEach(function (v) {
        if (play) v.play().catch(function () {});
        else v.pause();
      });
    }

    function setSplit(percent) {
      percent = Math.max(0, Math.min(100, percent));
      wrap.style.setProperty("--split", percent + "%");
      wrap.setAttribute("aria-valuenow", String(Math.round(percent)));
    }

    function updateFromPointer(e) {
      var rect = wrap.getBoundingClientRect();
      setSplit(((e.clientX - rect.left) / rect.width) * 100);
    }

    function checkRatios() {
      var allVideos = videos();
      if (allVideos.length < 2) return;
      if (!allVideos[0].videoWidth || !allVideos[1].videoWidth) return;

      var topRatio = allVideos[0].videoWidth / allVideos[0].videoHeight;
      var bottomRatio = allVideos[1].videoWidth / allVideos[1].videoHeight;
      if (Math.abs(topRatio - bottomRatio) > 0.01) useSingleVideo();
    }

    videos().forEach(function (v) {
      v.addEventListener("loadedmetadata", checkRatios);
    });

    wrap.addEventListener("pointerenter", function (e) {
      updateFromPointer(e);
      if (e.pointerType !== "touch") setPlaying(true);
    });
    wrap.addEventListener("pointermove", updateFromPointer);
    wrap.addEventListener("pointerleave", function (e) {
      if (e.pointerType !== "touch") setPlaying(false);
    });
    wrap.addEventListener("pointerdown", function (e) {
      updateFromPointer(e);
      if (e.pointerType === "touch") setPlaying(!isPlaying);
    });
    wrap.addEventListener("keydown", function (e) {
      var current = parseFloat(wrap.getAttribute("aria-valuenow") || "50");
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSplit(current - 5);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSplit(current + 5);
      }
    });

    return wrap;
  }

  function galleryRatio(items, key) {
    var best = null;
    items.forEach(function (it) {
      var ar = it[key];
      if (!ar || !ar[0] || !ar[1]) return;
      var r = ar[0] / ar[1];
      if (best === null || r < best) best = r;
    });
    return best;
  }

  function mountGallery(mountId, items) {
    var mount = document.getElementById(mountId);
    if (!mount || !items) return;
    var rt = galleryRatio(items, "ar"), rs = galleryRatio(items, "sideAr");
    if (rt) mount.dataset.arTop = rt.toFixed(4);
    if (rs) mount.dataset.arSide = rs.toFixed(4);
    var view = currentView();
    var r = view === "side" ? rs : rt;
    if (r) mount.style.setProperty("--card-ar", r.toFixed(4));
    items.forEach(function (item) {
      var card = document.createElement("figure");

      card.className = "card" + (item.method ? " card--m-" + item.method : "") +
                       (item.ref ? " card--ref" : "");

      var mediaWrap = document.createElement("div");
      mediaWrap.className = "card__media";
      if (item.badge) {
        var badge = document.createElement("span");
        badge.className = "card__badge";
        badge.textContent = item.badge;
        mediaWrap.appendChild(badge);
      }
      mediaWrap.appendChild(comparisonMedia(item));
      card.appendChild(mediaWrap);

      mount.appendChild(card);
    });
  }

  if (cfg.galleries) {
    Object.keys(cfg.galleries).forEach(function (mountId) {
      mountGallery(mountId, cfg.galleries[mountId]);
    });
  }

  // One featured gallery per section, in a FIXED camera view: its videos carry no
  // data-src-top/side, so the top/side switch inside the "all results" panels never touches them.
  function mountFeatured(el) {
    var items = (cfg.galleries || {})[el.dataset.featureMount] || [];
    var view = el.dataset.featureView === "side" ? "side" : "top";
    var only = el.dataset.featureOnly;
    if (only) items = items.filter(function (it) { return it.badge === only; });
    var r = galleryRatio(items, view === "side" ? "sideAr" : "ar");
    if (r) el.style.setProperty("--card-ar", r.toFixed(4));
    if (items.length === 1) el.classList.add("featured__gallery--one");
    items.forEach(function (item) {
      var card = document.createElement("figure");
      card.className = "card" + (item.method ? " card--m-" + item.method : "");
      var wrap = document.createElement("div");
      wrap.className = "card__media";
      if (item.badge) {
        var badge = document.createElement("span");
        badge.className = "card__badge";
        badge.textContent = item.badge;
        wrap.appendChild(badge);
      }
      var v = document.createElement("video");
      v.className = "media";
      // ?v=: these files were swapped for the full-resolution masters under the same names
      v.setAttribute("src", (view === "side" ? item.sideSrc : item.src) + "?v=hd1");
      v.poster = ((view === "side" ? item.sidePoster : item.poster) || "") + "?v=hd1";
      setupVideo(v, cardName(item));
      v.addEventListener("mouseenter", function () { v.play().catch(function () {}); });
      v.addEventListener("mouseleave", function () { v.pause(); });
      v.addEventListener("click", function () { toggleVideo(v); });
      wrap.appendChild(v);
      card.appendChild(wrap);
      el.appendChild(card);
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-feature-mount]"), mountFeatured);

  // "See all results": a page inside the page. It covers the window, the page behind it
  // stops scrolling, and it stays until the reader closes it (Close button or Esc).
  var openFull = null, openedBy = null;
  function closeFull() {
    if (!openFull) return;
    Array.prototype.forEach.call(openFull.querySelectorAll("video"), function (v) { v.pause(); });
    openFull.hidden = true;
    document.body.classList.remove("pub-noscroll");
    openFull = null;
    if (openedBy) { openedBy.focus(); openedBy = null; }
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-open-full]"), function (btn) {
    btn.addEventListener("click", function () {
      var panel = document.getElementById(btn.dataset.openFull);
      if (!panel) return;
      Array.prototype.forEach.call(document.querySelectorAll(".featured video"), function (v) { v.pause(); });
      closeFull();
      panel.hidden = false;
      panel.scrollTop = 0;
      document.body.classList.add("pub-noscroll");
      openFull = panel; openedBy = btn;
      var close = panel.querySelector("[data-close-full]");
      if (close) close.focus();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-close-full]"), function (b) {
    b.addEventListener("click", closeFull);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openFull) closeFull();
  });

  // Full-screen header video (after AMB3R's page): HD only. Two clips (still water, challenging
  // conditions) and the speed; a swap keeps the moment of the episode and the speed.
  (function initHeaderVideo() {
    var v = document.getElementById("vhead-video");
    if (!v) return;
    var clips = document.querySelectorAll(".vhead__btn[data-clip]");
    var sp = document.getElementById("vhead-speed");
    var SPEEDS = [1, 1.5, 2, 0.5], si = 0;
    // 10 s of still water, then ONE automatic switch to the challenging conditions; a click
    // before that cancels it, and nothing switches by itself afterwards.
    var auto = null, autoDone = false;
    function armAuto() {
      if (autoDone || auto) return;
      auto = setTimeout(function () {
        auto = null; autoDone = true;
        var c = document.querySelector('.vhead__btn[data-clip="cond"]');
        if (c && c.getAttribute("aria-pressed") !== "true") c.click();
      }, 10000);
    }
    v.addEventListener("playing", armAuto);
    if (!v.paused) armAuto();
    Array.prototype.forEach.call(clips, function (btn) {
      btn.addEventListener("click", function (e) {
        if (e.isTrusted) { autoDone = true; if (auto) { clearTimeout(auto); auto = null; } }
        var key = btn.dataset.clip, src = v.dataset[key];
        Array.prototype.forEach.call(clips, function (b) { b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
        Array.prototype.forEach.call(document.querySelectorAll(".vhead__cap"), function (c) { c.hidden = c.dataset.cap !== key; });
        if (!src || v.getAttribute("src") === src) return;
        var t = v.currentTime || 0;
        v.setAttribute("src", src);
        v.addEventListener("loadedmetadata", function once() {
          v.removeEventListener("loadedmetadata", once);
          try { v.currentTime = Math.min(t, (v.duration || t + 1) - 0.05); } catch (e) {}
          v.playbackRate = SPEEDS[si];
          v.play().catch(function () {});
        });
        v.load();
      });
    });
    if (sp) sp.addEventListener("click", function () {
      si = (si + 1) % SPEEDS.length;
      v.playbackRate = SPEEDS[si];
      sp.textContent = SPEEDS[si].toFixed(1) + "x";
    });
    var down = document.getElementById("scroll-down");
    if (down) down.addEventListener("click", function (e) {
      var t = document.getElementById("top");
      if (!t) return;
      e.preventDefault();
      t.scrollIntoView({ behavior: "smooth" });
    });
  })();

  // UCLR demo: one click swaps still water and the challenging conditions, at the same moment of
  // the episode and keeping play/pause, with the matching sentence of the caption.
  (function initDemoSwitch() {
    var btns = document.querySelectorAll(".demo-switch__btn");
    Array.prototype.forEach.call(btns, function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.dataset.demo;
        var from = document.querySelector("[data-demo-video]:not([hidden])");
        var to = document.querySelector('[data-demo-video="' + key + '"]');
        if (!to || to === from) return;
        var playing = from && !from.paused, t = from ? from.currentTime : 0;
        if (from) { from.pause(); from.hidden = true; }
        to.hidden = false;
        try { if (t && to.duration) to.currentTime = Math.min(t, to.duration - 0.05); else if (t) to.currentTime = t; } catch (e) {}
        if (playing) to.play().catch(function () {});
        Array.prototype.forEach.call(btns, function (b) {
          b.setAttribute("aria-pressed", b === btn ? "true" : "false");
        });
        Array.prototype.forEach.call(document.querySelectorAll("[data-demo-cap]"), function (c) {
          c.hidden = c.dataset.demoCap !== key;
        });
      });
    });
  })();

  initViewToggles();

  (function pruneEmptyTabs() {
    var groups = Array.prototype.slice.call(document.querySelectorAll(".tabs")).reverse();
    groups.forEach(function (group) {
      var bar = group.querySelector(":scope > .tabs__bar");
      var panelsWrap = group.querySelector(":scope > .tabs__panels");
      if (!bar || !panelsWrap) return;
      var buttons = Array.prototype.slice.call(bar.children);
      var panels = Array.prototype.slice.call(panelsWrap.children);
      if (buttons.length !== panels.length) return;

      var keep = panels.map(function (p) {
        return Array.prototype.slice.call(p.querySelectorAll("video, img.media"))
          .some(function (m) { return !!(m.getAttribute("src") || "").trim(); });
      });

      if (!keep.some(Boolean)) return;

      panels.forEach(function (p, i) {
        if (keep[i]) return;
        p.remove();
        buttons[i].remove();
      });
    });
  })();

  document.querySelectorAll(".tabs").forEach(function (group, groupIndex) {
    var bar = group.querySelector(":scope > .tabs__bar");
    var panelsWrap = group.querySelector(":scope > .tabs__panels");
    if (!bar || !panelsWrap) return;
    var buttons = Array.from(bar.children);
    var panels = Array.from(panelsWrap.children);
    function activate(index) {
      buttons.forEach(function (button, i) {
        button.classList.toggle("active", i === index);
        button.setAttribute("aria-selected", String(i === index));
        button.tabIndex = i === index ? 0 : -1;

        if (i !== index && panels[i].classList.contains("active")) {
          Array.prototype.forEach.call(panels[i].querySelectorAll("video"), function (v) {
            if (!v.paused) v.pause();
          });
        }
        panels[i].classList.toggle("active", i === index);
      });
    }
    buttons.forEach(function (button, i) {
      var key = "tabs-" + groupIndex + "-" + i;
      button.id = key;
      button.setAttribute("aria-controls", key + "-panel");
      panels[i].id = key + "-panel";
      panels[i].setAttribute("aria-labelledby", key);
      button.addEventListener("click", function () { activate(i); });
      button.addEventListener("keydown", function (event) {
        var target = i;
        if (event.key === "ArrowRight") target = (i + 1) % buttons.length;
        else if (event.key === "ArrowLeft") target = (i - 1 + buttons.length) % buttons.length;
        else if (event.key === "Home") target = 0;
        else if (event.key === "End") target = buttons.length - 1;
        else return;
        event.preventDefault();
        activate(target);
        buttons[target].focus();
      });
    });
    activate(0);
  });

  Array.prototype.forEach.call(
    document.querySelectorAll("video.media[data-hover-play]"), function (v) {
      v.addEventListener("mouseenter", function () { v.play().catch(function () {}); });
      v.addEventListener("mouseleave", function () { v.pause(); });
      v.addEventListener("click", function () { toggleVideo(v); });
    });

  function initScrollState() {
    var navEl = document.getElementById("nav");
    var fill = document.querySelector(".nav__marker span");
    var list = document.querySelector(".nav__links");
    var links = [];
    Array.prototype.forEach.call(
      document.querySelectorAll('.nav__links a[href^="#"]'), function (a) {
        var el = document.getElementById(a.getAttribute("href").slice(1));

        var li = a.parentNode;
        if (el) links.push({ a: a, el: el,
                             gen: li.classList.contains("nav__sub") ||
                                  li.classList.contains("nav__parent") });
      });
    if (!fill && !links.length) return;

    var OFFSET = 150;
    var current = null;

    function place() {
      if (!fill || !navEl) return;
      if (!current) { fill.style.opacity = "0"; return; }
      var a = current.a.getBoundingClientRect();
      var n = navEl.getBoundingClientRect();

      if (list) {
        var r = list.getBoundingClientRect();
        if (a.right <= r.left + 1 || a.left >= r.right - 1) { fill.style.opacity = "0"; return; }
      }
      fill.style.opacity = "1";
      fill.style.width = a.width.toFixed(1) + "px";
      fill.style.transform = "translateX(" + (a.left - n.left).toFixed(1) + "px)";
    }

    function reveal() {
      if (!list || !current) return;
      if (list.scrollWidth <= list.clientWidth) return;
      var PAD = 12;
      var a = current.a.getBoundingClientRect();
      var r = list.getBoundingClientRect();
      if (a.left < r.left + PAD) list.scrollLeft -= (r.left + PAD) - a.left;
      else if (a.right > r.right - PAD) list.scrollLeft += a.right - (r.right - PAD);
    }

    function update() {
      ticking = false;

      var found = null;
      for (var i = 0; i < links.length; i++) {
        if (links[i].el.getBoundingClientRect().top <= OFFSET) found = links[i];
      }
      if (found !== current) {
        if (current) current.a.removeAttribute("aria-current");
        if (found) found.a.setAttribute("aria-current", "true");
        current = found;

        if (list) list.classList.toggle("nav__links--gen", !!found && found.gen);
        reveal();
        place();
      }
    }

    var ticking = false, trail = 0;
    function onScroll() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
      clearTimeout(trail);
      trail = setTimeout(update, 140);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    if (list) {

      list.addEventListener("transitionend", function () { reveal(); place(); });

      list.addEventListener("transitionstart", function () {
        var n = 0;
        (function step() {
          place();
          if (++n < 20) window.requestAnimationFrame(step);
        })();
      });

      list.addEventListener("scroll", place, { passive: true });
    }

    window.addEventListener("hashchange", function () { setTimeout(update, 60); });

    window.addEventListener("load", function () { setTimeout(update, 0); setTimeout(place, 0); });
    update();
    place();
  }
  initScrollState();

  function revealHash() {
    var id = (location.hash || "").slice(1);
    if (!id) return;
    var el = document.getElementById(id);
    while (el) {
      if (el.tagName === "DETAILS") el.open = true;
      el = el.parentElement;
    }
  }
  window.addEventListener("hashchange", revealHash);
  revealHash();
  Array.from(document.querySelectorAll('a[href^="#"]')).forEach(function (a) {
    a.addEventListener("click", function () {
      var el = document.getElementById(a.getAttribute("href").slice(1));
      while (el) {
        if (el.tagName === "DETAILS") el.open = true;
        el = el.parentElement;
      }
    });
  });

  Array.from(document.querySelectorAll(".bibtex__copy")).forEach(function (btn) {
    btn.addEventListener("click", function () {
      var src = document.querySelector(btn.getAttribute("data-copy"));
      if (!src) return;
      var text = src.textContent;
      var done = function () {
        var was = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = was; }, 1400);
      };
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:absolute;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) { done(); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
    });
  });
})();
