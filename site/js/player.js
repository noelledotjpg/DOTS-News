(function () {
  "use strict";

  var all = [];

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmt(s) {
    s = Math.floor(s || 0);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  var HTML =
    '<video preload="metadata" playsinline></video>' +
    '<div class="top">' +
      '<span class="title"></span>' +
      '<button class="like" title="I like this"><span class="i c up"></span></button>' +
      '<button class="dislike" title="I dislike this"><span class="i c down"></span></button>' +
      '<button>share</button>' +
      '<button class="more">More info</button>' +
    '</div>' +
    '<div class="progress"><div class="load"></div><div class="fill"></div><div class="knob"></div></div>' +
    '<div class="controls">' +
      '<button class="pp sep" title="Play"><span class="i play"></span><span class="i pause-i"></span></button>' +
      '<div class="volwrap sep"><button class="mute" title="Mute"><span class="i vol"></span></button>' +
        '<div class="vwrap"><div class="vslider"><div class="vfill"></div><div class="vknob"></div></div></div></div>' +
      '<div class="time"><span class="cur">0:00</span> / <span class="dur">0:00</span></div>' +
      '<div class="spacer"></div>' +
      '<button class="wd" title="Widescreen"><span class="i wide"></span></button>' +
      '<button title="Settings" class="sep"><span class="i gear"></span></button>' +
      '<button title="Watch later" class="sep"><span class="i clock"></span></button>' +
      '<button class="logo-b" title="Watch on YouTube"><span class="i c ytlogo"></span></button>' +
      '<button class="fs" title="Full screen"><span class="i fs"></span></button>' +
    '</div>';

  function create(opts) {
    var yt = document.createElement("div");
    yt.className = "yt paused";
    yt.innerHTML = HTML;
    var q = function (sel) { return yt.querySelector(sel); };

    var v = q("video");
    v.src = opts.src + "#t=0.1";           
    v.setAttribute("title", opts.title || "");
    q(".title").textContent = opts.title || "";
    q(".title").title = opts.title || "";

    if (opts.onError) { v.addEventListener("error", function () { opts.onError(yt); }); }

    
    q(".logo-b").onclick = function () { if (opts.url) { window.open(opts.url, "_blank", "noopener"); } };
    if (!opts.url) { q(".logo-b").style.display = "none"; }

    var pp = q(".pp");
    function sync() {
      var playing = !v.paused;
      yt.classList.toggle("playing", playing);
      yt.classList.toggle("paused", !playing);
      pp.title = playing ? "Pause" : "Play";
    }
    pp.onclick = function () { return v.paused ? v.play() : v.pause(); };
    v.onclick = pp.onclick;
    v.onplay = function () {
      all.forEach(function (o) { if (o !== v) { o.pause(); } });
      sync();
    };
    v.onpause = sync;
    v.onended = function () { v.currentTime = 0; sync(); };
    all.push(v);

    
    var dur = q(".dur"), cur = q(".cur"), fill = q(".fill"), knob = q(".knob"), load = q(".load");
    v.onloadedmetadata = v.ondurationchange = function () { dur.textContent = fmt(v.duration); };
    v.ontimeupdate = function () {
      var r = v.duration ? v.currentTime / v.duration : 0;
      fill.style.width = knob.style.left = r * 100 + "%";
      cur.textContent = fmt(v.currentTime);
    };
    v.onprogress = function () {
      if (v.buffered.length && v.duration) {
        load.style.width = v.buffered.end(v.buffered.length - 1) / v.duration * 100 + "%";
      }
    };

    
    function drag(el, fn) {
      function move(e) {
        var r = el.getBoundingClientRect();
        fn(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
      }
      el.onpointerdown = function (e) {
        el.setPointerCapture(e.pointerId);
        el.classList.add("drag");
        move(e);
        el.onpointermove = move;
      };
      el.onpointerup = el.onpointercancel = function () { el.classList.remove("drag"); el.onpointermove = null; };
    }
    drag(q(".progress"), function (r) { if (v.duration) { v.currentTime = r * v.duration; } });

    var vfill = q(".vfill"), vknob = q(".vknob");
    function volUI() {
      var r = v.muted ? 0 : v.volume;
      vfill.style.width = vknob.style.left = r * 100 + "%";
      yt.classList.toggle("is-muted", v.muted || v.volume === 0);
    }
    drag(q(".vslider"), function (r) { v.volume = r; v.muted = false; volUI(); });
    q(".mute").onclick = function () { v.muted = !v.muted; volUI(); };

    
    q(".fs").onclick = function () {
      if (document.fullscreenElement) { document.exitFullscreen(); } else { yt.requestFullscreen(); }
    };
    q(".wd").onclick = function () { yt.style.width = yt.style.width === "640px" ? "480px" : "640px"; };

    
    ["like", "dislike"].forEach(function (cls) {
      var other = cls === "like" ? "dislike" : "like";
      q("." + cls).onclick = function () { q("." + other).classList.remove("on"); q("." + cls).classList.toggle("on"); };
    });

    
    var t;
    yt.onmousemove = function () {
      yt.classList.remove("idle");
      clearTimeout(t);
      t = setTimeout(function () { if (!v.paused) { yt.classList.add("idle"); } }, 2500);
    };

    volUI();
    return yt;
  }

  window.DOTSPlayer = { create: create };
}());
