(function () {
  "use strict";

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];

  var postsEl = document.getElementById("posts");

  // Which page is this? (set on <body data-page="..."> in each html file)
  var PAGE = document.body.getAttribute("data-page") || "news";
  var VIEWS = {
    news: {
      dir: "data/", home: "./", homeLabel: "Home", back: "Back to the news",
      empty: "No news yet.", error: "The news could not be loaded.", title: ""
    },
    archive: {
      dir: "data/experimental/", home: "experimental.html", homeLabel: "Archive", back: "Back to the archive",
      empty: "Nothing has been archived yet.", error: "The archive could not be loaded.",
      title: "Experimental Changes (Archive)"
    },
    videos: {
      dir: "data/", home: "videos.html", homeLabel: "Videos", back: "Back to the videos",
      empty: "No videos yet.", error: "The videos could not be loaded.", title: "Videos"
    }
  };
  var view = VIEWS[PAGE] || VIEWS.news;

  // ---------------------------------------------------------------- helpers

  function getJSON(url, options) {
    return fetch(url, options).then(function (res) {
      if (!res.ok) { throw new Error(url + " returned HTTP " + res.status); }
      return res.json();
    });
  }

  // index/site are always revalidated so a fresh upload shows up right away
  var REVALIDATE = { cache: "no-cache" };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") { node.className = attrs[k]; }
      else if (k === "text") { node.textContent = attrs[k]; }
      else if (k === "html") { node.innerHTML = attrs[k]; }
      else { node.setAttribute(k, attrs[k]); }
    });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  function formatDate(iso) {
    // Use the date part as written; avoids timezone shifts.
    var p = iso.slice(0, 10).split("-");
    return MONTHS[parseInt(p[1], 10) - 1] + " " + parseInt(p[2], 10) + ", " + p[0];
  }

  // ------------------------------------------------- post body -> HTML

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // {{links.name}} -> URL from site.toml
  function expandLinks(text, links) {
    return text.replace(/\{\{\s*links\.([\w-]+)\s*\}\}/g, function (_, key) {
      if (links && Object.prototype.hasOwnProperty.call(links, key)) { return links[key]; }
      console.warn("Unknown link name in post: " + key);
      return "";
    });
  }

  // Where the pictures, clips and videos (the media/ folder) are served from. Empty = next to the pages.
  // Set window.DOTS_MEDIA_BASE in js/config.js to host them elsewhere, e.g. on GitHub Pages:
  //   "https://USERNAME.github.io/REPO/site/media/"   ->  media/cat.png  becomes  <that address>cat.png
  var MEDIA_BASE = String(window.DOTS_MEDIA_BASE || "");
  if (MEDIA_BASE && !/\/$/.test(MEDIA_BASE)) { MEDIA_BASE += "/"; }

  function mediaUrl(url) {
    return MEDIA_BASE && /^media\//.test(url) ? MEDIA_BASE + url.slice(6) : url;
  }

  // Only allow http(s), mailto and relative URLs. Files in media/ are pointed at MEDIA_BASE.
  function safeUrl(url) {
    var scheme = /^([a-z][a-z0-9+.\-]*):/i.exec(url);
    if (scheme && !/^(https?|mailto)$/i.test(scheme[1])) { return "#"; }
    return mediaUrl(url);
  }

  // YouTube watch / youtu.be / embed / shorts / live URL -> 11-character video id
  function youtubeId(url) {
    var m = /^https?:\/\/(?:www\.|m\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})(?:[?&#\/]|$)/i.exec(url);
    return m ? m[1] : null;
  }

  function videoEmbed(id, title) {
    return '<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/' + id + '"' +
      ' title="' + escapeHtml(title) + '" loading="lazy" allowfullscreen' +
      ' allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"' +
      ' referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
  }

  var IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif)(?:[?#].*)?$/i;
  var VIDEO_FILE = /\.(mp4|webm|mov)(?:[?#].*)?$/i;
  var AUDIO_FILE = /\.(mp3|ogg|wav)(?:[?#].*)?$/i;

  function linkBlock(href) {
    return { image: false, html: '<p><a href="' + escapeHtml(href) + '">' + escapeHtml(href) + "</a></p>" };
  }

  // -> { image: boolean, html: string }; anything unsupported becomes a plain link
  function mediaBlock(kind, title, href) {
    if (kind === "video") {
      var id = youtubeId(href);
      if (id) { return { image: false, html: videoEmbed(id, title || "YouTube video") }; }
      if (VIDEO_FILE.test(href)) {
        return { image: false, html: '<video class="clip" controls preload="metadata" playsinline src="' +
          escapeHtml(href) + '" title="' + escapeHtml(title) + '"></video>' };
      }
    } else if (kind === "image" && IMAGE_FILE.test(href)) {
      return { image: true, html: '<a class="shot" href="' + escapeHtml(href) + '" target="_blank" rel="noopener">' +
        '<img src="' + escapeHtml(href) + '" alt="' + escapeHtml(title) + '" loading="lazy"></a>' };
    } else if (kind === "audio" && AUDIO_FILE.test(href)) {
      return { image: false, html: '<audio controls preload="none" src="' + escapeHtml(href) +
        '" title="' + escapeHtml(title) + '"></audio>' };
    }
    return linkBlock(href);
  }

  function inline(text) {
    var out = escapeHtml(text);
    out = out.replace(/\*\*([^\n]+?)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/\*([^\s*](?:[^*\n]*[^\s*])?)\*/g, "<em>$1</em>");
    return out;
  }

  function renderBody(body, links) {
    var anchors = [];
    var text = body.replace(/\r\n?/g, "\n").replace(/<br\s*\/?>\n?/gi, "\n");

    // a line that is only  ![video](url)  ![image: alt](url)  or  ![audio: title](url)
    // becomes an embedded player / picture. `blocks` holds the finished HTML.
    var blocks = [];
    text = text.replace(/^[ \t]*!\[(video|image|audio)(?::\s*([^\]\n]*))?\]\(([^)\s]+)\)[ \t]*$/gim, function (_, kind, title, url) {
      var href = safeUrl(expandLinks(url, links));
      blocks.push(mediaBlock(kind.toLowerCase(), (title || "").trim(), href));
      return "\n\n\u0001" + (blocks.length - 1) + "\u0001\n\n";
    });

    // pull links out first so their URLs aren't touched by bold/italic rules
    text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, function (_, label, url) {
      var href = safeUrl(expandLinks(url, links));
      anchors.push('<a href="' + escapeHtml(href) + '">' + inline(label) + "</a>");
      return "\u0000" + (anchors.length - 1) + "\u0000";
    });

    text = expandLinks(text, links);

    var out = [], run = [];
    function flushImages() {
      if (run.length > 1) { out.push('<div class="gallery">' + run.join("\n") + "</div>"); }
      else if (run.length === 1) { out.push(run[0]); }
      run = [];
    }
    text.split(/\n{2,}/).forEach(function (para) {
      para = para.replace(/^\n+|\n+$/g, "");
      if (!para) { return; }
      var block = /^\u0001(\d+)\u0001$/.exec(para);
      if (block) {
        var b = blocks[+block[1]];
        if (b.image) { run.push(b.html); } else { flushImages(); out.push(b.html); }
        return;
      }
      flushImages();
      out.push("<p>" + inline(para).replace(/\n/g, "<br>\n") + "</p>");
    });
    flushImages();
    var html = out.join("\n");

    return html.replace(/\u0000(\d+)\u0000/g, function (_, i) { return anchors[+i]; });
  }

  var votes = {};

  function bar(parts) {
    var total = parts.reduce(function (n, p) { return n + p.n; }, 0);
    var b = el("span", { "class": "vote-bar", "aria-hidden": "true" });
    parts.forEach(function (p) {
      if (p.n) { b.appendChild(el("span", { "class": p.cls, style: "width:" + (100 * p.n / total).toFixed(1) + "%" })); }
    });
    return b;
  }

  function renderVotes(v) {
    var box = el("div", { "class": "votes" });
    var opts = v.options ? Object.keys(v.options) : [];
    if (v.up || v.down) {
      var score = v.up - v.down;
      box.appendChild(el("div", { "class": "vote-line", text: "Yes " + v.up + " \u00b7 No " + v.down +
        " \u00b7 Score " + (score > 0 ? "+" : score < 0 ? "\u2212" : "") + Math.abs(score) }));
      box.appendChild(bar([{ n: v.up, cls: "yes" }, { n: v.down, cls: "no" }]));
    }
    if (opts.length) {
      box.appendChild(el("div", { "class": "vote-line", text: opts.map(function (k) {
        return "Option " + k + ": " + v.options[k];
      }).join(" \u00b7 ") }));
      box.appendChild(bar(opts.map(function (k, i) { return { n: v.options[k], cls: "opt" + (i % 4) }; })));
    }
    return box;
  }

  function renderPost(post, links, pinned) {
    var heading = el("h3", {}, [el("a", { href: "?post=" + encodeURIComponent(post.slug), text: post.title })]);
    var content = el("div", { "class": "content", html: renderBody(post.body, links) });
    // a picture that failed to load (file not uploaded yet, etc.) becomes a small note instead of a broken icon
    Array.prototype.forEach.call(content.querySelectorAll("img"), function (img) {
      img.addEventListener("error", function () {
        var note = el("span", { "class": "muted", text: "[image unavailable]" });
        if (img.parentNode) { img.parentNode.replaceChild(note, img); }
      });
    });
    var date = el("div", { "class": "date" });
    if (pinned) { date.appendChild(el("span", { "class": "pin-label", text: "Pinned \u00b7" })); }
    date.appendChild(document.createTextNode(formatDate(post.date)));
    var parts = [heading, date];
    if (PAGE === "archive" && votes[post.slug]) { parts.push(renderVotes(votes[post.slug])); }
    parts.push(content);
    return el("div", { style: "margin-top:16px" }, parts);
  }

  function renderSidebar(site) {
    var td = document.getElementById("sidebar");
    td.textContent = "";
    var links = site.links || {};
    (site.sidebar || []).forEach(function (group) {
      if (group.image) {
        var img = el("img", { src: group.image, alt: group.image_alt || "", "class": "side-img" });
        if (group.image_width) { img.setAttribute("width", group.image_width); }
        var holder = el("div", { "class": "side-image" });
        if (group.image_url) {
          holder.appendChild(el("a", { href: safeUrl(expandLinks(group.image_url, links)) }, [img]));
        } else {
          holder.appendChild(img);
        }
        td.appendChild(holder);
        return;
      }
      if (group.heading) {
        if (group.bold) {
          td.appendChild(el("b", { text: group.heading }));
          td.appendChild(el("br"));
        } else {
          td.appendChild(el("h2", { text: group.heading }));
        }
      }
      (group.links || []).forEach(function (l) {
        td.appendChild(el("a", {
          href: safeUrl(expandLinks(l.url, links)),
          text: l.wrap ? l.label : l.label.replace(/ /g, "\u00a0")
        }));
        td.appendChild(el("br"));
      });
      if (group.note) {
        td.appendChild(el("span", { "class": "muted", text: group.note }));
        td.appendChild(el("br"));
      }
      td.appendChild(el("br"));
    });
  }

  function pageLink(n) { return n <= 1 ? view.home : "?page=" + n; }
  function renderPagination(page, pages, linkFor) {
    if (pages <= 1) { return null; }
    linkFor = linkFor || pageLink;
    var nav = el("div", { "class": "pagination" });
    function add(label, n, cls) {
      nav.appendChild(el("a", { href: linkFor(n), "class": cls || "", text: label }));
    }
    if (page > 1) { add("Newer", page - 1, "step"); }
    var last = 0;
    for (var n = 1; n <= pages; n++) {
      if (n !== 1 && n !== pages && Math.abs(n - page) > 2) { continue; }
      if (n - last > 1) { nav.appendChild(el("span", { "class": "gap", text: "\u2026" })); }
      if (n === page) {
        nav.appendChild(el("span", { "class": "current", "aria-current": "page", text: String(n) }));
      } else {
        add(String(n), n);
      }
      last = n;
    }
    if (page < pages) { add("Older", page + 1, "step"); }
    return nav;
  }

  function showMessage(text, withHomeLink, backHref, backLabel) {
    postsEl.textContent = "";
    postsEl.appendChild(el("p", { text: text }));
    if (withHomeLink) {
      postsEl.appendChild(el("p", { "class": "post-nav" }, [
        el("a", { href: backHref || view.home, text: backLabel || view.back })
      ]));
    }
  }

  function showList(site, index, page) {
    var perPage = site.per_page || 10;
    // pinned posts sit above the list on the first page only and don't count towards paging
    var pinned = index.posts.filter(function (p) { return p.pinned; });
    var all = index.posts.filter(function (p) { return !p.pinned; });
    var pages = Math.max(1, Math.ceil(all.length / perPage));

    if (page < 1 || page > pages) {
      return showMessage("There is no page " + page + ".", true);
    }
    if (!index.posts.length) { return showMessage(view.empty); }

    var shown = page === 1 ? pinned : [];
    var slice = all.slice((page - 1) * perPage, page * perPage);
    return Promise.all(shown.concat(slice).map(loadPost)).then(function (posts) {
      postsEl.textContent = "";
      var pins = posts.slice(0, shown.length), rest = posts.slice(shown.length);

      pins.forEach(function (p) { postsEl.appendChild(renderPost(p, site.links, true)); });
      if (pins.length && rest.length) { postsEl.appendChild(el("hr")); }
      rest.forEach(function (p) { postsEl.appendChild(renderPost(p, site.links, false)); });
      var bottomNav = renderPagination(page, pages);
      if (bottomNav) { postsEl.appendChild(bottomNav); }
    });
  }

  function pageTitle(site) {
    return view.title ? view.title + " | " + site.title : site.title;
  }

  function showSingle(site, index, slug) {
    var i = -1;
    index.posts.forEach(function (p, n) { if (p.slug === slug) { i = n; } });
    if (i === -1) {
      document.title = "Not Found | " + pageTitle(site);
      return showMessage("That post could not be found.", true);
    }
    return loadPost(index.posts[i]).then(function (post) {
      document.title = post.title + " | " + pageTitle(site);
      postsEl.textContent = "";
      postsEl.appendChild(renderPost(post, site.links, !!post.pinned));
      var nav = el("p", { "class": "post-nav" });
      if (i > 0) { nav.appendChild(el("a", { href: "?post=" + encodeURIComponent(index.posts[i - 1].slug), text: "Newer" })); }
      if (i < index.posts.length - 1) { nav.appendChild(el("a", { href: "?post=" + encodeURIComponent(index.posts[i + 1].slug), text: "Older" })); }
      nav.appendChild(el("a", { href: view.home, text: view.homeLabel }));
      if (PAGE === "news") { nav.appendChild(shareLink(post.slug)); }
      postsEl.appendChild(nav);
    });
  }

  // "Share" copies the /p/<slug>/ link, the one that gives a Discord embed (see share_pages.py)
  function shareLink(slug) {
    var url = new URL("p/" + encodeURIComponent(slug) + "/", location.href).href;
    var a = el("a", { href: url, text: "Share", title: "Copy a link that embeds nicely in Discord" });
    a.addEventListener("click", function (e) {
      e.preventDefault();
      function done() { a.textContent = "Link copied!"; setTimeout(function () { a.textContent = "Share"; }, 2000); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { window.prompt("Copy this link:", url); });
      } else { window.prompt("Copy this link:", url); }
    });
    return a;
  }

  function loadPost(entry) {
    return getJSON(view.dir + "posts/" + encodeURIComponent(entry.slug) + ".json?v=" + entry.rev);
  }

  var GALLERY_PAGE = "gallery.html";

  function galleryLink(source, page) {
    var q = [];
    if (source) { q.push("source=" + encodeURIComponent(source)); }
    if (page > 1) { q.push("page=" + page); }
    return GALLERY_PAGE + (q.length ? "?" + q.join("&") : "");
  }

  function unavailable(node, what) {
    node.addEventListener("error", function () {
      if (node.parentNode) { node.parentNode.replaceChild(el("span", { "class": "muted", text: "[" + what + " unavailable]" }), node); }
    });
  }

  function renderTile(item) {
    var thumb, alt = item.alt || item.title || "";
    if (item.type === "image") {
      var img = el("img", { src: safeUrl(item.file), alt: alt, loading: "lazy", decoding: "async" });
      unavailable(img, "image");
      thumb = el("a", { "class": "thumb", href: safeUrl(item.file), target: "_blank", rel: "noopener" }, [img]);
    } else if (item.type === "video") {
      thumb = el("video", { "class": "thumb", controls: "", preload: "metadata", playsinline: "",
                            src: safeUrl(item.file) + "#t=0.1", title: alt });
    } else if (item.type === "audio") {
      thumb = el("div", { "class": "thumb audio" }, [
        el("span", { "class": "muted", text: "Audio" }),
        el("audio", { controls: "", preload: "none", src: safeUrl(item.file), title: alt })
      ]);
    } else if (item.type === "youtube") {
      var yt = el("img", { src: "https://i.ytimg.com/vi/" + encodeURIComponent(item.id) + "/mqdefault.jpg",
                           alt: alt, loading: "lazy", decoding: "async" });
      unavailable(yt, "thumbnail");
      thumb = el("a", { "class": "thumb youtube", href: safeUrl(item.url), target: "_blank", rel: "noopener" }, [yt]);
    } else {
      return null;
    }

    var caption = el("figcaption");
    if (item.title) {
      caption.appendChild(item.link
        ? el("a", { href: safeUrl(item.link), text: item.title })
        : el("span", { text: item.title }));
      caption.appendChild(el("br"));
    }
    caption.appendChild(el("span", { "class": "date", text: formatDate(item.date) }));
    return el("figure", { "class": "tile" }, [thumb, caption]);
  }

  function showGallery(site, gallery, query) {
    var perPage = site.gallery_per_page || 30;
    var sources = gallery.sources || [];
    var source = query.get("source") || "";
    if (!sources.some(function (s) { return s.id === source; })) { source = ""; }

    var items = source ? gallery.items.filter(function (i) { return i.source === source; }) : gallery.items;
    var pages = Math.max(1, Math.ceil(items.length / perPage));
    var page = parseInt(query.get("page"), 10);
    if (isNaN(page)) { page = 1; }
    if (page < 1 || page > pages) {
      return showMessage("There is no page " + page + ".", true, galleryLink(source, 1), "Back to the gallery");
    }

    postsEl.textContent = "";
    postsEl.appendChild(el("h3", { text: "Gallery" }));
    postsEl.appendChild(el("p", { "class": "muted",
      text: "Pictures, clips and videos from the news, the experimental changes archive and the Discord server. Click a picture to see it full size." }));

    // All (160) | News posts (146) | ...
    if (sources.length > 1) {
      var filters = el("p", { "class": "filters" });
      [{ id: "", label: "All", count: gallery.items.length }].concat(sources).forEach(function (s) {
        var text = s.label + " (" + s.count + ")";
        filters.appendChild(s.id === source
          ? el("span", { "class": "current", "aria-current": "page", text: text })
          : el("a", { href: galleryLink(s.id, 1), text: text }));
      });
      postsEl.appendChild(filters);
    }

    if (!items.length) {
      postsEl.appendChild(el("p", { text: "Nothing here yet." }));
      return;
    }

    var grid = el("div", { "class": "tiles" });
    items.slice((page - 1) * perPage, page * perPage).forEach(function (item) {
      var tile = renderTile(item);
      if (tile) { grid.appendChild(tile); }
    });
    postsEl.appendChild(grid);

    var nav = renderPagination(page, pages, function (n) { return galleryLink(source, n); });
    if (nav) { postsEl.appendChild(nav); }
  }

  function linkify(text) {
    return escapeHtml(text).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"&]/g, function (url) {
      var raw = url.replace(/&amp;/g, "&");
      return '<a href="' + escapeHtml(safeUrl(raw)) + '" rel="noopener">' + url + "</a>";
    });
  }

  function enableDownload(a, fileName) {
    var url = new URL(a.getAttribute("href"), window.location.href);
    if (url.origin === window.location.origin) { return; }
    a.addEventListener("click", function (e) {
      if (a.getAttribute("data-busy")) { e.preventDefault(); return; }
      e.preventDefault();
      var label = a.textContent;
      a.setAttribute("data-busy", "1");
      a.textContent = "Archive (downloading\u2026)";
      fetch(url.href).then(function (res) {
        if (!res.ok) { throw new Error("HTTP " + res.status); }
        return res.blob();
      }).then(function (blob) {
        var obj = URL.createObjectURL(blob);
        var tmp = el("a", { href: obj, download: fileName });
        document.body.appendChild(tmp);
        tmp.click();
        document.body.removeChild(tmp);
        setTimeout(function () { URL.revokeObjectURL(obj); }, 60000);
      }).catch(function () {
        window.open(url.href, "_blank", "noopener");
      }).then(function () {
        a.textContent = label;
        a.removeAttribute("data-busy");
      });
    });
  }

  function renderVideo(v) {
    var id = v.id;
    var title = v.title || "Untitled video";
    var node = el("div", { "class": "video-entry", id: "v-" + id, style: "margin-top:16px" });
    node.appendChild(el("h3", {}, [el("a", { href: safeUrl(v.url || ("https://www.youtube.com/watch?v=" + id)), text: title })]));

    var meta = el("div", { "class": "date" });
    meta.appendChild(document.createTextNode(v.date ? "Uploaded " + formatDate(v.date) : "Upload date unknown"));
    if (v.unlisted) { meta.appendChild(el("span", { "class": "pin-label", style: "margin-left:6px", text: "· Unlisted" })); }
    node.appendChild(meta);

    if (v.description) {
      node.appendChild(el("div", { "class": "content video-desc", html: linkify(v.description) }));
    }

    node.appendChild(el("div", { "class": "content", html: videoEmbed(id, title) }));

    var ext = v.file ? v.file.replace(/^.*\./, "") : "mp4";
    var name = title.replace(/[\\\/:*?"<>|]+/g, "").trim() || id;
    var archive = el("a", { href: safeUrl(v.file || ("media/videos/" + id + ".mp4")), download: name + "." + ext, text: "Archive" });
    enableDownload(archive, name + "." + ext);
    node.appendChild(el("p", { "class": "post-nav" }, [archive]));
    return node;
  }

  function showVideos(site, data, query) {
    var perPage = site.videos_per_page || 10;
    var videos = data.videos || [];
    if (!videos.length) { return showMessage(view.empty); }
    var pages = Math.max(1, Math.ceil(videos.length / perPage));
    var page = parseInt(query.get("page"), 10);
    if (isNaN(page)) { page = 1; }
    if (page < 1 || page > pages) { return showMessage("There is no page " + page + ".", true); }

    postsEl.textContent = "";
    postsEl.appendChild(el("h3", { text: "Videos" }));
    postsEl.appendChild(el("p", { "class": "muted",
      text: "Every Disorder of the Stone video on YouTube. “Archive” downloads a saved copy of the video." }));
    videos.slice((page - 1) * perPage, page * perPage).forEach(function (v, i) {
      if (i > 0) { postsEl.appendChild(el("hr")); }
      postsEl.appendChild(renderVideo(v));
    });
    var nav = renderPagination(page, pages);
    if (nav) { postsEl.appendChild(nav); }
  }

  var dataFile = PAGE === "gallery" ? "data/gallery.json"
               : PAGE === "videos"  ? "data/videos.json"
               : view.dir + "index.json";

  // votes are optional: no votes.json just means no tallies are shown
  var votesLoaded = PAGE === "archive"
    ? getJSON(view.dir + "votes.json", REVALIDATE).catch(function () { return {}; })
    : Promise.resolve({});

  Promise.all([getJSON("data/site.json", REVALIDATE), getJSON(dataFile, REVALIDATE), votesLoaded])
    .then(function (res) {
      var site = res[0], data = res[1];
      votes = res[2] || {};

      renderSidebar(site);
      document.getElementById("disclaimer").textContent = site.disclaimer || "";
      var query = new URLSearchParams(window.location.search);

      if (PAGE === "gallery") {
        document.title = "Gallery | " + site.title;
        return showGallery(site, data, query);
      }

      if (PAGE === "videos") {
        document.title = pageTitle(site);
        return showVideos(site, data, query);
      }

      document.title = pageTitle(site);
      if (query.has("post")) { return showSingle(site, data, query.get("post")); }
      var page = parseInt(query.get("page"), 10);
      return showList(site, data, isNaN(page) ? 1 : page);
    })
    .catch(function (err) {
      console.error(err);
      showMessage(PAGE === "gallery" ? "The gallery could not be loaded. Try again in a moment."
                                     : view.error + " Try again in a moment.");
      if (window.location.protocol === "file:") {
        postsEl.appendChild(el("p", {
          "class": "muted",
          text: "This page can't load its data when opened as a file. Run `python news.py serve` and use the address it prints."
        }));
      }
    });
}());