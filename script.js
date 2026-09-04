const DEFAULT_LINKS = [
  { name: "Gmail", url: "https://mail.google.com" },
  { name: "YouTube", url: "https://youtube.com" },
  { name: "GitHub", url: "https://github.com" },
  { name: "Reddit", url: "https://reddit.com" },
];

const SEARCH_ENGINES = {
  google: "https://www.google.com/search?q=",
  bing: "https://www.bing.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q=",
};

const BACKGROUND_PHOTOS = [
  { file: "backgrounds/bg1-cat.jpg", label: "Cat" },
  { file: "backgrounds/bg2-birch.jpg", label: "Birch" },
  { file: "backgrounds/bg3-happy.jpg", label: "Be Happy" },
  { file: "backgrounds/bg4-sunset-bridge.jpg", label: "Sunset Bridge" },
  { file: "backgrounds/bg5-yosemite.jpg", label: "Yosemite" },
  { file: "backgrounds/bg6-koi.jpg", label: "Koi Pond" },
  { file: "backgrounds/bg7-red-mountains.jpg", label: "Red Mountains" },
  { file: "backgrounds/bg8-pink-bridge.jpg", label: "Pink Bridge" },
];

const PALETTES = {
  default: { label: "Default", dark: ["#6a8cff", "#a86bff", "#ff6ec7"], light: ["#dfe9ff", "#f3e8ff", "#ffe0f0"] },
  sunset:  { label: "Sunset",  dark: ["#ff7e5f", "#feb47b", "#ffd166"], light: ["#ffe5d9", "#ffd8a8", "#fff0d1"] },
  ocean:   { label: "Ocean",   dark: ["#2193b0", "#6dd5ed", "#00c9a7"], light: ["#d4f1f9", "#c9e7f5", "#d9fbf0"] },
  forest:  { label: "Forest",  dark: ["#134e5e", "#71b280", "#a3d977"], light: ["#e0f2e9", "#d0e8d8", "#eaf7d9"] },
  mono:    { label: "Mono",    dark: ["#3a3a3a", "#6e6e6e", "#9e9e9e"], light: ["#f2f2f2", "#e0e0e0", "#cfcfcf"] },
};

const el = (id) => document.getElementById(id);

function normalizeUrl(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function faviconFor(url) {
  try {
    const host = new URL(normalizeUrl(url)).hostname;
    return `https://www.google.com/s2/favicons?sz=64&domain=${host}`;
  } catch {
    return "";
  }
}

// ---------- Storage helpers ----------
function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}
function setStorage(items) {
  return new Promise((resolve) => chrome.storage.sync.set(items, resolve));
}
// Uploaded photos are too large for storage.sync's 8KB-per-item limit, so they
// live in storage.local instead (10MB quota, device-only — doesn't sync).
function getLocal(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
function setLocal(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}
function removeLocal(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

// Downscale + compress an uploaded image client-side before storing it, so a
// 15MB phone photo doesn't blow the storage quota or slow the new tab down.
function resizeAndCompress(file, maxDim = 2560, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that image"));
    };
    img.src = objectUrl;
  });
}

// ---------- Clock & greeting ----------
let timeFormat = "12";

function updateClock() {
  const now = new Date();
  const h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, "0");

  if (timeFormat === "24") {
    el("clock").textContent = `${String(h).padStart(2, "0")}:${m}`;
  } else {
    const displayH = (h % 12) || 12;
    el("clock").textContent = `${displayH}:${m} ${h < 12 ? "AM" : "PM"}`;
  }

  const greeting =
    h < 5 ? "Good night" :
    h < 12 ? "Good morning" :
    h < 17 ? "Good afternoon" :
    h < 21 ? "Good evening" : "Good night";
  el("greeting").textContent = greeting;
}

// ---------- Theme & palette ----------
let currentPalette = "default";

async function initTheme() {
  const { theme, palette } = await getStorage(["theme", "palette"]);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const activeTheme = theme || (prefersDark ? "dark" : "light");
  currentPalette = palette || "default";
  applyTheme(activeTheme);
  applyPalette(currentPalette);
  renderPaletteSwatches();
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  el("themeBtn").textContent = theme === "dark" ? "☀️" : "🌙";
  applyPalette(currentPalette);
}

function applyPalette(paletteKey) {
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  const palette = PALETTES[paletteKey] || PALETTES.default;
  const [bg1, bg2, bg3] = palette[theme];
  document.documentElement.style.setProperty("--bg-1", bg1);
  document.documentElement.style.setProperty("--bg-2", bg2);
  document.documentElement.style.setProperty("--bg-3", bg3);
}

function renderPaletteSwatches() {
  const row = el("paletteRow");
  row.innerHTML = "";
  Object.entries(PALETTES).forEach(([key, palette]) => {
    const btn = document.createElement("button");
    btn.className = "palette-swatch" + (key === currentPalette ? " active" : "");
    btn.title = palette.label;
    btn.style.background = `linear-gradient(135deg, ${palette.dark[0]}, ${palette.dark[1]}, ${palette.dark[2]})`;
    btn.addEventListener("click", async () => {
      currentPalette = key;
      applyPalette(key);
      await setStorage({ palette: key });
      renderPaletteSwatches();
    });
    row.appendChild(btn);
  });
}

el("themeBtn").addEventListener("click", async () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  await setStorage({ theme: next });
});

// ---------- Background mode (Aurora / Photo) ----------
function dayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

async function initBackgroundMode() {
  const { bgMode, photoIndex } = await getStorage(["bgMode", "photoIndex"]);
  const mode = bgMode || "aurora";
  let index;
  if (photoIndex === "custom") {
    const { customPhotoData } = await getLocal("customPhotoData");
    index = customPhotoData ? "custom" : dayOfYear() % BACKGROUND_PHOTOS.length;
  } else {
    index = typeof photoIndex === "number" ? photoIndex : dayOfYear() % BACKGROUND_PHOTOS.length;
  }
  applyBackgroundMode(mode);
  await applyPhoto(index);
  await renderPhotoThumbs(index);
}

function applyBackgroundMode(mode) {
  document.body.classList.toggle("photo-mode", mode === "photo");
  el("paletteSection").hidden = mode === "photo";
  el("photoSection").hidden = mode !== "photo";
  document.querySelectorAll("#bgMode button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}

async function applyPhoto(index) {
  let src;
  if (index === "custom") {
    const { customPhotoData } = await getLocal("customPhotoData");
    if (!customPhotoData) {
      console.warn("[nook] no custom photo stored, falling back");
      index = 0;
    } else {
      src = customPhotoData;
    }
  }
  if (index !== "custom") {
    const photo = BACKGROUND_PHOTOS[index];
    if (!photo) {
      console.warn("[nook] no photo at index", index);
      return;
    }
    src = photo.file;
  }

  const layer = el("bgPhoto");
  const preload = new Image();
  preload.onload = () => {
    layer.style.backgroundImage = `url("${src}")`;
    layer.classList.add("visible");
  };
  preload.onerror = () => {
    console.error("[nook] failed to load background photo:", src, "— check the file exists and the extension was reloaded in chrome://extensions");
  };
  preload.src = src;
}

async function renderPhotoThumbs(activeIndex) {
  const row = el("photoThumbs");
  row.innerHTML = "";

  const { customPhotoData } = await getLocal("customPhotoData");
  if (customPhotoData) {
    const btn = document.createElement("button");
    btn.className = "photo-thumb custom-thumb" + (activeIndex === "custom" ? " active" : "");
    btn.title = "Your photo";
    btn.style.backgroundImage = `url("${customPhotoData}")`;
    btn.addEventListener("click", async () => {
      await applyPhoto("custom");
      await renderPhotoThumbs("custom");
      await setStorage({ photoIndex: "custom" });
    });

    const removeBtn = document.createElement("span");
    removeBtn.className = "thumb-remove";
    removeBtn.title = "Remove your photo";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await removeLocal("customPhotoData");
      if (activeIndex === "custom") {
        const fallback = dayOfYear() % BACKGROUND_PHOTOS.length;
        await applyPhoto(fallback);
        await setStorage({ photoIndex: fallback });
        await renderPhotoThumbs(fallback);
      } else {
        await renderPhotoThumbs(activeIndex);
      }
    });
    btn.appendChild(removeBtn);
    row.appendChild(btn);
  }

  BACKGROUND_PHOTOS.forEach((photo, i) => {
    const btn = document.createElement("button");
    btn.className = "photo-thumb" + (i === activeIndex ? " active" : "");
    btn.title = photo.label;
    btn.style.backgroundImage = `url("${photo.file}")`;
    btn.addEventListener("click", async () => {
      await applyPhoto(i);
      await renderPhotoThumbs(i);
      await setStorage({ photoIndex: i });
    });
    row.appendChild(btn);
  });
}

document.querySelectorAll("#bgMode button").forEach((btn) => {
  btn.addEventListener("click", async () => {
    applyBackgroundMode(btn.dataset.mode);
    await setStorage({ bgMode: btn.dataset.mode });
  });
});

el("shufflePhoto").addEventListener("click", async () => {
  const { photoIndex } = await getStorage("photoIndex");
  let next = Math.floor(Math.random() * BACKGROUND_PHOTOS.length);
  if (BACKGROUND_PHOTOS.length > 1) {
    while (next === photoIndex) next = Math.floor(Math.random() * BACKGROUND_PHOTOS.length);
  }
  await applyPhoto(next);
  await renderPhotoThumbs(next);
  await setStorage({ photoIndex: next });
});

// ---------- Upload a custom background photo ----------
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB — generous, just guards against freezing the tab on huge files

el("uploadPhotoBtn").addEventListener("click", () => el("photoUpload").click());

el("photoUpload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = ""; // allow re-selecting the same file later
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Please choose an image file.");
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    alert("That image is quite large — please choose one under 20MB.");
    return;
  }

  try {
    const dataUrl = await resizeAndCompress(file);
    await setLocal({ customPhotoData: dataUrl });
    await setStorage({ photoIndex: "custom" });
    if (!document.body.classList.contains("photo-mode")) {
      applyBackgroundMode("photo");
      await setStorage({ bgMode: "photo" });
    }
    await applyPhoto("custom");
    await renderPhotoThumbs("custom");
  } catch (err) {
    console.error("[nook] failed to process uploaded photo:", err);
    alert("Couldn't load that image — try a different file.");
  }
});

// ---------- Time format ----------
async function initTimeFormat() {
  const { timeFormat: stored } = await getStorage("timeFormat");
  timeFormat = stored || "12";
  document.querySelectorAll("#timeFormat button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.format === timeFormat);
  });
}

document.querySelectorAll("#timeFormat button").forEach((btn) => {
  btn.addEventListener("click", async () => {
    timeFormat = btn.dataset.format;
    document.querySelectorAll("#timeFormat button").forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    updateClock();
    await setStorage({ timeFormat });
  });
});

// ---------- Search ----------
el("searchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = el("searchInput").value.trim();
  if (!query) return;
  const { searchEngine } = await getStorage("searchEngine");
  const base = SEARCH_ENGINES[searchEngine || "google"];
  window.location.href = base + encodeURIComponent(query);
});

// ---------- Quick links ----------
async function getLinks() {
  const { links } = await getStorage("links");
  return links || DEFAULT_LINKS;
}

async function renderLinks() {
  const links = await getLinks();
  const container = el("quickLinks");
  container.innerHTML = "";
  links.forEach((link, i) => {
    const a = document.createElement("a");
    a.className = "quick-link";
    a.href = normalizeUrl(link.url);
    a.style.setProperty("--i", i);
    a.innerHTML = `
      <span class="tile"><img src="${faviconFor(link.url)}" width="28" height="28" style="border-radius:6px" onerror="this.style.display='none'" /></span>
      <span class="label">${link.name}</span>
    `;
    container.appendChild(a);
  });
}

async function renderLinkList() {
  const links = await getLinks();
  const list = el("linkList");
  list.innerHTML = "";
  links.forEach((link, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${link.name}</span>`;
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", async () => {
      const updated = links.filter((_, idx) => idx !== i);
      await setStorage({ links: updated });
      await renderLinks();
      await renderLinkList();
    });
    li.appendChild(removeBtn);
    list.appendChild(li);
  });
}

el("addLinkForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = el("linkName").value.trim();
  const url = el("linkUrl").value.trim();
  if (!name || !url) return;
  const links = await getLinks();
  links.push({ name, url });
  await setStorage({ links });
  el("linkName").value = "";
  el("linkUrl").value = "";
  await renderLinks();
  await renderLinkList();
});

// ---------- Search engine select ----------
async function initSearchEngine() {
  const { searchEngine } = await getStorage("searchEngine");
  el("searchEngine").value = searchEngine || "google";
}
el("searchEngine").addEventListener("change", async (e) => {
  await setStorage({ searchEngine: e.target.value });
});

// ---------- Settings panel ----------
function openSettings() {
  el("settingsPanel").hidden = false;
  el("overlay").hidden = false;
}
function closeSettings() {
  el("settingsPanel").hidden = true;
  el("overlay").hidden = true;
}
el("settingsBtn").addEventListener("click", openSettings);
el("closeSettings").addEventListener("click", closeSettings);
el("overlay").addEventListener("click", () => {
  closeSettings();
  closeInbox();
});

// ---------- Inbox ----------
function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const min = 60 * 1000, hr = 60 * min, day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < day * 7) return `${Math.floor(diff / day)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function domainOf(url) {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function getInboxItems() {
  const { inboxItems } = await getLocal("inboxItems");
  return inboxItems || [];
}

let inboxFilterType = "all";

async function renderInbox() {
  const items = await getInboxItems();
  const query = el("inboxSearch").value.trim().toLowerCase();

  const filtered = items.filter((item) => {
    if (inboxFilterType !== "all" && item.type !== inboxFilterType) return false;
    if (!query) return true;
    const haystack = `${item.title} ${item.url} ${item.selectionText || ""}`.toLowerCase();
    return haystack.includes(query);
  });

  const list = el("inboxList");
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = `<li class="inbox-empty">Your inbox is empty — right-click any page or selected text to save it here.</li>`;
    return;
  }
  if (!filtered.length) {
    list.innerHTML = `<li class="inbox-empty">No saved items match your search.</li>`;
    return;
  }

  filtered.forEach((item) => {
    const snippet = item.type === "selection" ? item.selectionText : domainOf(item.url);
    const li = document.createElement("li");
    li.className = "inbox-item";
    li.innerHTML = `
      <img class="inbox-favicon" src="${item.favicon || "icons/icon16.png"}" />
      <div class="inbox-body">
        <div class="inbox-title">${escapeHtml(item.title)}</div>
        <div class="inbox-snippet">${escapeHtml(snippet)}</div>
        <div class="inbox-meta">${item.type === "selection" ? "✂️ Selection" : "📄 Page"} · ${timeAgo(item.savedAt)}</div>
      </div>
      <button class="inbox-delete" title="Remove" aria-label="Remove">✕</button>
    `;
    li.querySelector(".inbox-favicon").addEventListener("error", (e) => {
      e.target.src = "icons/icon16.png";
    });
    li.querySelector(".inbox-body").addEventListener("click", () => {
      if (item.url) window.open(normalizeUrl(item.url), "_blank");
    });
    li.querySelector(".inbox-delete").addEventListener("click", async (e) => {
      e.stopPropagation();
      const current = await getInboxItems();
      await setLocal({ inboxItems: current.filter((i) => i.id !== item.id) });
      await renderInbox();
    });
    list.appendChild(li);
  });
}

async function updateInboxBadge() {
  const items = await getInboxItems();
  const badge = el("inboxBadge");
  if (items.length > 0) {
    badge.textContent = items.length > 99 ? "99+" : String(items.length);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

// Keep the panel and badge in sync if items are saved (context menu/popup) or
// removed while this new-tab page happens to be open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.inboxItems) {
    updateInboxBadge();
    if (!el("inboxPanel").hidden) renderInbox();
  }
});

el("inboxSearch").addEventListener("input", renderInbox);

document.querySelectorAll("#inboxFilter button").forEach((btn) => {
  btn.addEventListener("click", () => {
    inboxFilterType = btn.dataset.filter;
    document.querySelectorAll("#inboxFilter button").forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    renderInbox();
  });
});

function openInbox() {
  el("inboxPanel").hidden = false;
  el("overlay").hidden = false;
  renderInbox();
}
function closeInbox() {
  el("inboxPanel").hidden = true;
  el("overlay").hidden = true;
}
el("inboxBtn").addEventListener("click", openInbox);
el("closeInbox").addEventListener("click", closeInbox);

// ---------- Battery/CPU: pause aurora animation when the tab isn't visible ----------
document.addEventListener("visibilitychange", () => {
  document.body.classList.toggle("tab-hidden", document.hidden);
});

// ---------- Init ----------
(async function init() {
  await initTheme();
  await initBackgroundMode();
  await initTimeFormat();
  updateClock();
  setInterval(updateClock, 1000 * 30);
  await renderLinks();
  await renderLinkList();
  await initSearchEngine();
  await updateInboxBadge();
  if (location.hash === "#inbox") {
    openInbox();
    history.replaceState(null, "", location.pathname + location.search);
  }
})();
