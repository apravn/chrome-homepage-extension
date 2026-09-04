const MENU_SAVE_PAGE = "nook-save-page";
const MENU_SAVE_SELECTION = "nook-save-selection";

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

async function getInbox() {
  const { inboxItems } = await chrome.storage.local.get("inboxItems");
  return inboxItems || [];
}

async function addItem(item) {
  const items = await getInbox();
  items.unshift(item);
  await chrome.storage.local.set({ inboxItems: items });
  await updateBadge();
}

async function updateBadge() {
  const items = await getInbox();
  const count = items.length;
  await chrome.action.setBadgeText({ text: count > 0 ? String(count > 99 ? "99+" : count) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#6a5cd1" });
}

function flashSavedBadge() {
  chrome.action.setBadgeText({ text: "✓" });
  chrome.action.setBadgeBackgroundColor({ color: "#2ecc71" });
  setTimeout(updateBadge, 900);
}

async function savePage(tab) {
  if (!tab || !tab.url) return;
  await addItem({
    id: makeId(),
    type: "page",
    title: tab.title || tab.url,
    url: tab.url,
    selectionText: null,
    favicon: tab.favIconUrl || "",
    tags: [],
    savedAt: Date.now(),
  });
  flashSavedBadge();
}

async function saveSelection(info, tab) {
  if (!info.selectionText) return;
  const text = info.selectionText.trim();
  await addItem({
    id: makeId(),
    type: "selection",
    title: text.slice(0, 60) + (text.length > 60 ? "…" : ""),
    url: (tab && tab.url) || info.pageUrl || "",
    selectionText: text,
    favicon: (tab && tab.favIconUrl) || "",
    tags: [],
    savedAt: Date.now(),
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

// The popup can't easily read "the active tab" itself in a way that also
// works after it's about to close, so it asks the background page to do it.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "nook-save-current-page") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      savePage(tab).then(() => sendResponse({ ok: true }));
    });
    return true; // keep the message channel open for the async response
  }
  if (message?.type === "nook-save-selection") {
    // The popup reads the selection itself (via chrome.scripting) since it
    // can't rely on a contextMenus click event — shape it to match saveSelection's
    // (info, tab) signature so the same save path handles both entry points.
    saveSelection(
      { selectionText: message.selectionText, pageUrl: message.pageUrl },
      { url: message.pageUrl, favIconUrl: message.favicon }
    ).then(() => sendResponse({ ok: true }));
    return true;
  }
});

// Keep the badge accurate if items are deleted from the Inbox view itself.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.inboxItems) {
    updateBadge();
  }
});
