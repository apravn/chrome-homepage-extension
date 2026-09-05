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
  closeImportPanel();
});

// ---------- Boards ----------
const MIGRATION_FLAG_KEY = "nookMigrationV2";

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

// A context-menu save or the Quick Save shortcut can fire from background.js
// before this page has ever run post-update, so background.js carries its
// own copy of this same one-time migration, guarded by the same flag.
async function ensureMigrated() {
  const { [MIGRATION_FLAG_KEY]: migrated } = await getLocal(MIGRATION_FLAG_KEY);
  if (migrated) return;

  const { inboxItems } = await getLocal("inboxItems");
  const oldItems = inboxItems || [];

  const defaultBoard = {
    id: makeId(),
    name: "Inbox",
    order: 0,
    createdAt: Date.now(),
    isDefault: true,
  };

  const cards = oldItems.map((item, i) => ({
    id: item.id || makeId(),
    boardId: defaultBoard.id,
    order: i, // old array was newest-first (unshift), so index doubles as order
    type: item.type,
    title: item.title,
    url: item.url,
    selectionText: item.selectionText ?? null,
    favicon: item.favicon || "",
    tags: item.tags || [],
    savedAt: item.savedAt,
    source: "migrated",
  }));

  // Leave the old inboxItems key untouched — cheap insurance, and
  // unlimitedStorage makes the storage cost of keeping it irrelevant.
  await setLocal({
    nookBoards: [defaultBoard],
    nookCards: cards,
    [MIGRATION_FLAG_KEY]: true,
  });
}

async function getBoards() {
  await ensureMigrated();
  const { nookBoards } = await getLocal("nookBoards");
  return (nookBoards || []).slice().sort((a, b) => a.order - b.order);
}

async function getCards() {
  await ensureMigrated();
  const { nookCards } = await getLocal("nookCards");
  return nookCards || [];
}

async function setBoards(boards) {
  await setLocal({ nookBoards: boards });
}

async function setCards(cards) {
  await setLocal({ nookCards: cards });
}

let activeBoardId = null;
let boardFilterType = "all";
let boardTabsSortable = null;
let boardCardsSortable = null;

async function renderBoardTabs() {
  const boards = await getBoards();

  if (!activeBoardId || !boards.some((b) => b.id === activeBoardId)) {
    const fallback = boards.find((b) => b.isDefault) || boards[0];
    activeBoardId = fallback && fallback.id;
  }

  const row = el("boardTabs");
  row.innerHTML = "";

  boards.forEach((board) => {
    const tab = document.createElement("div");
    tab.className = "board-tab" + (board.id === activeBoardId ? " active" : "");
    tab.dataset.boardId = board.id;
    tab.innerHTML = `
      <span class="board-tab-name">${escapeHtml(board.name)}</span>
      <span class="board-tab-actions">
        <button type="button" class="board-tab-rename" title="Rename board" aria-label="Rename board">✏️</button>
        <button type="button" class="board-tab-delete" title="Delete board" aria-label="Delete board">🗑️</button>
      </span>
    `;
    tab.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      activeBoardId = board.id;
      renderBoardTabs();
      renderActiveBoard();
    });
    tab.querySelector(".board-tab-rename").addEventListener("click", (e) => {
      e.stopPropagation();
      startRenameBoard(tab, board);
    });
    tab.querySelector(".board-tab-delete").addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteBoard(board);
    });
    row.appendChild(tab);
  });

  await populateBoardSelects(boards);

  if (boardTabsSortable) boardTabsSortable.destroy();
  boardTabsSortable = new Sortable(row, {
    animation: 150,
    onEnd: handleBoardReorder,
  });
}

function startRenameBoard(tab, board) {
  const nameEl = tab.querySelector(".board-tab-name");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "board-tab-rename-input";
  input.value = board.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = async () => {
    const name = input.value.trim();
    if (name && name !== board.name) {
      const boards = await getBoards();
      const target = boards.find((b) => b.id === board.id);
      if (target) target.name = name;
      await setBoards(boards);
    }
    await renderBoardTabs();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      input.value = board.name;
      input.blur();
    }
  });
  input.addEventListener("blur", commit, { once: true });
}

async function deleteBoard(board) {
  const boards = await getBoards();
  if (boards.length <= 1) {
    alert("You need at least one board.");
    return;
  }
  const cards = await getCards();
  const affected = cards.filter((c) => c.boardId === board.id);
  const fallback = boards.find((b) => b.id !== board.id && b.isDefault) || boards.find((b) => b.id !== board.id);

  const confirmMsg = affected.length
    ? `Delete "${board.name}"? Its ${affected.length} card${affected.length === 1 ? "" : "s"} will move to "${fallback.name}".`
    : `Delete "${board.name}"?`;
  if (!confirm(confirmMsg)) return;

  const remainingBoards = boards.filter((b) => b.id !== board.id).map((b, i) => ({ ...b, order: i }));
  const movedCards = cards.map((c) => (c.boardId === board.id ? { ...c, boardId: fallback.id } : c));

  await setBoards(remainingBoards);
  await setCards(movedCards);

  if (activeBoardId === board.id) activeBoardId = fallback.id;
  await renderBoardTabs();
  await renderActiveBoard();
}

el("addBoardBtn").addEventListener("click", async () => {
  const name = prompt("Name this board:");
  if (!name || !name.trim()) return;
  const boards = await getBoards();
  boards.push({ id: makeId(), name: name.trim(), order: boards.length, createdAt: Date.now(), isDefault: false });
  await setBoards(boards);
  activeBoardId = boards[boards.length - 1].id;
  await renderBoardTabs();
  await renderActiveBoard();
});

async function handleBoardReorder() {
  const ids = Array.from(el("boardTabs").children).map((node) => node.dataset.boardId);
  const boards = await getBoards();
  const reordered = ids
    .map((id, i) => {
      const b = boards.find((x) => x.id === id);
      return b ? { ...b, order: i } : null;
    })
    .filter(Boolean);
  await setBoards(reordered);
}

async function populateBoardSelects(boardsArg) {
  const list = boardsArg || (await getBoards());
  const { defaultQuickSaveBoardId } = await getLocal("defaultQuickSaveBoardId");
  const quickSaveSelect = el("quickSaveBoard");
  quickSaveSelect.innerHTML = list.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("");
  const fallbackId = (list.find((b) => b.isDefault) || list[0] || {}).id;
  quickSaveSelect.value =
    defaultQuickSaveBoardId && list.some((b) => b.id === defaultQuickSaveBoardId) ? defaultQuickSaveBoardId : fallbackId;
}

el("quickSaveBoard").addEventListener("change", async (e) => {
  await setLocal({ defaultQuickSaveBoardId: e.target.value });
});

async function renderActiveBoard() {
  const cards = await getCards();
  const boards = await getBoards();
  const query = el("boardSearch").value.trim().toLowerCase();

  const inBoard = cards.filter((c) => c.boardId === activeBoardId).sort((a, b) => a.order - b.order);

  const filtered = inBoard.filter((card) => {
    if (boardFilterType !== "all" && card.type !== boardFilterType) return false;
    if (!query) return true;
    const haystack = `${card.title} ${card.url} ${card.selectionText || ""}`.toLowerCase();
    return haystack.includes(query);
  });

  const grid = el("boardCards");
  grid.innerHTML = "";

  if (!inBoard.length) {
    grid.innerHTML = `<div class="board-empty">Nothing here yet — right-click any page or selected text, use the Quick Save shortcut, or import your bookmarks.</div>`;
  } else if (!filtered.length) {
    grid.innerHTML = `<div class="board-empty">No cards match your search.</div>`;
  } else {
    filtered.forEach((card) => {
      const snippet = card.type === "selection" ? card.selectionText : domainOf(card.url);
      const typeIcon = card.type === "selection" ? "✂️" : card.type === "bookmark" ? "🔖" : "📄";
      const otherBoards = boards.filter((b) => b.id !== card.boardId);

      const cardEl = document.createElement("div");
      cardEl.className = "board-card";
      cardEl.dataset.cardId = card.id;
      cardEl.innerHTML = `
        <div class="board-card-body">
          <img class="board-card-favicon" src="${card.favicon || "icons/icon16.png"}" />
          <div class="board-card-text">
            <div class="board-card-title">${escapeHtml(card.title)}</div>
            <div class="board-card-snippet">${escapeHtml(snippet)}</div>
            <div class="board-card-meta">${typeIcon} ${timeAgo(card.savedAt)}</div>
          </div>
        </div>
        <div class="board-card-controls">
          <select class="board-card-move" title="Move to board" aria-label="Move to board">
            <option value="">Move to…</option>
            ${otherBoards.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("")}
          </select>
          <button class="board-card-delete" title="Remove" aria-label="Remove">✕</button>
        </div>
      `;
      cardEl.querySelector(".board-card-favicon").addEventListener("error", (e) => {
        e.target.src = "icons/icon16.png";
      });
      cardEl.querySelector(".board-card-body").addEventListener("click", () => {
        if (card.url) window.open(normalizeUrl(card.url), "_blank");
      });
      cardEl.querySelector(".board-card-move").addEventListener("change", async (e) => {
        if (!e.target.value) return;
        await moveCard(card.id, e.target.value);
      });
      cardEl.querySelector(".board-card-delete").addEventListener("click", async (e) => {
        e.stopPropagation();
        await deleteCard(card.id);
      });
      grid.appendChild(cardEl);
    });
  }

  if (boardCardsSortable) boardCardsSortable.destroy();
  boardCardsSortable = new Sortable(grid, {
    animation: 150,
    ghostClass: "card-ghost",
    filter: ".board-empty",
    onEnd: handleCardDrop,
  });
}

async function deleteCard(id) {
  const cards = await getCards();
  await setCards(cards.filter((c) => c.id !== id));
  await renderActiveBoard();
}

async function moveCard(id, targetBoardId) {
  const cards = await getCards();
  const targetCards = cards.filter((c) => c.boardId === targetBoardId);
  const minOrder = targetCards.length ? Math.min(...targetCards.map((c) => c.order)) : 0;
  const updated = cards.map((c) =>
    c.id === id ? { ...c, boardId: targetBoardId, order: targetCards.length ? minOrder - 1 : 0 } : c
  );
  await setCards(updated);
  await renderActiveBoard();
}

// Only the active board's grid is ever rendered at a time (boards are tabs,
// not simultaneous columns), so dragging only ever reorders within it —
// moving a card to a different board goes through the "Move to…" select
// above instead, which also covers touch/keyboard-only users.
async function handleCardDrop() {
  const ids = Array.from(el("boardCards").children).map((node) => node.dataset.cardId).filter(Boolean);
  const cards = await getCards();
  const reordered = cards.map((c) => {
    const idx = ids.indexOf(c.id);
    return idx === -1 || c.boardId !== activeBoardId ? c : { ...c, order: idx };
  });
  await setCards(reordered);
}

async function updateCardCountBadge() {
  const cards = await getCards();
  const badge = el("cardCountBadge");
  if (cards.length > 0) {
    badge.textContent = cards.length > 99 ? "99+" : String(cards.length);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

// Keep everything in sync if cards/boards change from elsewhere (context
// menu, Quick Save shortcut, or bookmarks import) while this page is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.nookCards || changes.nookBoards)) {
    updateCardCountBadge();
    renderBoardTabs();
    renderActiveBoard();
  }
});

el("boardSearch").addEventListener("input", renderActiveBoard);

document.querySelectorAll("#boardFilter button").forEach((btn) => {
  btn.addEventListener("click", () => {
    boardFilterType = btn.dataset.filter;
    document.querySelectorAll("#boardFilter button").forEach((b) => b.classList.toggle("active", b === btn));
    renderActiveBoard();
  });
});

// ---------- Bookmarks import ----------
function openImportPanel() {
  el("importPanel").hidden = false;
  el("overlay").hidden = false;
  el("importStatus").hidden = true;
  renderBookmarkTree();
  populateImportTargetBoard();
}
function closeImportPanel() {
  el("importPanel").hidden = true;
  el("overlay").hidden = true;
}
el("importBtn").addEventListener("click", openImportPanel);
el("closeImport").addEventListener("click", closeImportPanel);

async function populateImportTargetBoard() {
  const boards = await getBoards();
  const options = boards.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`);
  options.push(`<option value="__new__">+ New board…</option>`);
  el("importTargetBoard").innerHTML = options.join("");
}

async function renderBookmarkTree() {
  const container = el("bookmarkTree");
  container.innerHTML = `<p class="settings-hint">Loading…</p>`;
  const [rootNode] = await chrome.bookmarks.getTree();
  container.innerHTML = "";
  (rootNode.children || []).forEach((child) => container.appendChild(renderBookmarkNode(child)));
}

function renderBookmarkNode(node) {
  const wrap = document.createElement("div");
  wrap.className = "bookmark-node";

  const row = document.createElement("label");
  row.className = "bookmark-row";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  if (node.url) checkbox.dataset.url = node.url;
  row.appendChild(checkbox);
  const label = document.createElement("span");
  label.textContent = node.title || node.url || "(untitled)";
  row.appendChild(label);
  wrap.appendChild(row);

  // Checking a folder checks every bookmark nested under it.
  checkbox.addEventListener("change", () => {
    wrap.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = checkbox.checked));
  });

  if (node.children && node.children.length) {
    const childWrap = document.createElement("div");
    childWrap.className = "bookmark-children";
    node.children.forEach((child) => childWrap.appendChild(renderBookmarkNode(child)));
    wrap.appendChild(childWrap);
  }

  return wrap;
}

function showImportStatus(message, isError) {
  const status = el("importStatus");
  status.textContent = message;
  status.classList.toggle("error", !!isError);
  status.hidden = false;
}

el("runImportBtn").addEventListener("click", async () => {
  const checked = Array.from(el("bookmarkTree").querySelectorAll('input[type="checkbox"]:checked')).filter(
    (cb) => cb.dataset.url // only leaf bookmarks carry a URL — folders are just checkbox propagation
  );
  if (!checked.length) {
    showImportStatus("Select at least one bookmark first.", true);
    return;
  }

  const boards = await getBoards();
  let targetId = el("importTargetBoard").value;
  if (targetId === "__new__") {
    const name = prompt("Name the new board:");
    if (!name || !name.trim()) return;
    const board = { id: makeId(), name: name.trim(), order: boards.length, createdAt: Date.now(), isDefault: false };
    await setBoards([...boards, board]);
    targetId = board.id;
  }

  const cards = await getCards();
  const existingInTarget = cards.filter((c) => c.boardId === targetId);
  let nextOrder = existingInTarget.length ? Math.max(...existingInTarget.map((c) => c.order)) + 1 : 0;

  const imported = checked.map((cb) => ({
    id: makeId(),
    boardId: targetId,
    order: nextOrder++,
    type: "bookmark",
    title: cb.parentElement.querySelector("span").textContent,
    url: cb.dataset.url,
    selectionText: null,
    favicon: faviconFor(cb.dataset.url),
    tags: [],
    savedAt: Date.now(),
    source: "bookmark-import",
  }));

  await setCards([...cards, ...imported]);
  await renderBoardTabs();
  if (activeBoardId === targetId) await renderActiveBoard();
  showImportStatus(`Imported ${imported.length} bookmark${imported.length === 1 ? "" : "s"}.`);
});

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
  await renderBoardTabs();
  await renderActiveBoard();
  await updateCardCountBadge();
  if (location.hash === "#boards" || location.hash === "#inbox") {
    el("boardsSection").scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", location.pathname + location.search);
  }
})();
