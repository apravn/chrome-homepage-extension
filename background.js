const MENU_SAVE_PAGE = "nook-save-page";
const MENU_SAVE_SELECTION = "nook-save-selection";
const MIGRATION_FLAG_KEY = "nookMigrationV2";

// Context menu items are registered once on install/update — Chrome keeps
// them registered across service worker sleep/wake and browser restarts.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_SAVE_PAGE,
    title: "Save page to Nook",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: MENU_SAVE_SELECTION,
    title: "Save selection to Nook",
    contexts: ["selection"],
  });
  updateBadge();
});

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- Boards/cards data model + one-time migration ----------
// A context-menu save can happen before the new-tab page has ever run post-
// update, so this migration must be reachable from the service worker too —
// it can't only live in script.js.
async function ensureMigrated() {
  const { [MIGRATION_FLAG_KEY]: migrated } = await chrome.storage.local.get(MIGRATION_FLAG_KEY);
  if (migrated) return;

  const { inboxItems } = await chrome.storage.local.get("inboxItems");
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
  await chrome.storage.local.set({
    nookBoards: [defaultBoard],
    nookCards: cards,
    [MIGRATION_FLAG_KEY]: true,
  });
}

async function getBoards() {
  await ensureMigrated();
  const { nookBoards } = await chrome.storage.local.get("nookBoards");
  return nookBoards || [];
}

async function getCards() {
  await ensureMigrated();
  const { nookCards } = await chrome.storage.local.get("nookCards");
  return nookCards || [];
}

// Resolves which board a new save should land in: the user's chosen
// "quick save" target if set and still valid, else whichever board is
// flagged isDefault, else (defensively) the first board that exists.
async function resolveDefaultBoardId() {
  const boards = await getBoards();
  const { defaultQuickSaveBoardId } = await chrome.storage.local.get("defaultQuickSaveBoardId");
  if (defaultQuickSaveBoardId && boards.some((b) => b.id === defaultQuickSaveBoardId)) {
    return defaultQuickSaveBoardId;
  }
  const fallback = boards.find((b) => b.isDefault) || boards[0];
  return fallback && fallback.id;
}

async function addCard(card) {
  const [cards, boardId] = await Promise.all([getCards(), card.boardId ? Promise.resolve(card.boardId) : resolveDefaultBoardId()]);
  const cardsInBoard = cards.filter((c) => c.boardId === boardId);
  const minOrder = cardsInBoard.length ? Math.min(...cardsInBoard.map((c) => c.order)) : 0;
  cards.push({ ...card, boardId, order: cardsInBoard.length ? minOrder - 1 : 0 });
  await chrome.storage.local.set({ nookCards: cards });
  await updateBadge();
}

async function updateBadge() {
  const cards = await getCards();
  const count = cards.length;
  await chrome.action.setBadgeText({ text: count > 0 ? String(count > 99 ? "99+" : count) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#6a5cd1" });
}

function flashSavedBadge() {
  chrome.action.setBadgeText({ text: "✓" });
  chrome.action.setBadgeBackgroundColor({ color: "#2ecc71" });
  setTimeout(updateBadge, 900);
}

async function savePage(tab, opts = {}) {
  if (!tab || !tab.url) return;
  await addCard({
    id: makeId(),
    boardId: opts.boardId,
    type: "page",
    title: tab.title || tab.url,
    url: tab.url,
    selectionText: null,
    favicon: tab.favIconUrl || "",
    tags: [],
    savedAt: Date.now(),
    source: opts.source || "context-menu",
  });
  flashSavedBadge();
}

async function saveSelection(info, tab, opts = {}) {
  if (!info.selectionText) return;
  const text = info.selectionText.trim();
  await addCard({
    id: makeId(),
    boardId: opts.boardId,
    type: "selection",
    title: text.slice(0, 60) + (text.length > 60 ? "…" : ""),
    url: (tab && tab.url) || info.pageUrl || "",
    selectionText: text,
    favicon: (tab && tab.favIconUrl) || "",
    tags: [],
    savedAt: Date.now(),
    source: opts.source || "context-menu",
  });
  flashSavedBadge();
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_SAVE_PAGE) {
    savePage(tab);
  } else if (info.menuItemId === MENU_SAVE_SELECTION) {
    saveSelection(info, tab);
  }
});

// Quick Save keyboard shortcut (chrome://extensions/shortcuts) — saves the
// active tab through the exact same path as the context menu.
chrome.commands.onCommand.addListener((command) => {
  if (command === "quick-save") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      savePage(tab, { source: "quick-save" });
    });
  }
});

// The popup can't easily read "the active tab" itself in a way that also
// works after it's about to close, so it asks the background page to do it.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "nook-save-current-page") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      savePage(tab, { source: "popup" }).then(() => sendResponse({ ok: true }));
    });
    return true; // keep the message channel open for the async response
  }
  if (message?.type === "nook-save-selection") {
    // The popup reads the selection itself (via chrome.scripting) since it
    // can't rely on a contextMenus click event — shape it to match saveSelection's
    // (info, tab) signature so the same save path handles both entry points.
    saveSelection(
      { selectionText: message.selectionText, pageUrl: message.pageUrl },
      { url: message.pageUrl, favIconUrl: message.favicon },
      { source: "popup" }
    ).then(() => sendResponse({ ok: true }));
    return true;
  }
});

// Keep the badge accurate if cards are added/removed from the boards view itself.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.nookCards) {
    updateBadge();
  }
});
