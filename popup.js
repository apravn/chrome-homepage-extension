const el = (id) => document.getElementById(id);

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

async function getRecentCards() {
  const { nookCards } = await chrome.storage.local.get("nookCards");
  return (nookCards || []).slice().sort((a, b) => b.savedAt - a.savedAt);
}

let statusTimer = null;
function showStatus(message, isError = false) {
  const status = el("status");
  status.textContent = message;
  status.classList.toggle("error", isError);
  status.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    status.hidden = true;
  }, 2200);
}

async function renderRecent() {
  const items = (await getRecentCards()).slice(0, 4);
  const list = el("recentList");
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = `<li class="empty">Nothing saved yet</li>`;
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <img src="${item.favicon || "icons/icon16.png"}" />
      <span class="title">${escapeHtml(item.title)}</span>
    `;
    li.querySelector("img").addEventListener("error", (e) => {
      e.target.src = "icons/icon16.png";
    });
    li.addEventListener("click", () => {
      if (item.url) chrome.tabs.create({ url: item.url });
    });
    list.appendChild(li);
  });
}

el("savePageBtn").addEventListener("click", async () => {
  const btn = el("savePageBtn");
  btn.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: "nook-save-current-page" });
    if (res?.ok) {
      showStatus("Saved page ✓");
      await renderRecent();
    } else {
      showStatus("Couldn't save this page", true);
    }
  } catch (err) {
    console.error("[nook] popup save page failed:", err);
    showStatus("Couldn't save this page", true);
  } finally {
    btn.disabled = false;
  }
});

el("saveSelectionBtn").addEventListener("click", async () => {
  const btn = el("saveSelectionBtn");
  btn.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showStatus("No active tab", true);
      return;
    }

    let selectionText = "";
    try {
      const [{ result } = {}] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection().toString(),
      });
      selectionText = result || "";
    } catch (err) {
      // Fails on chrome:// pages, the Web Store, and similar restricted tabs.
      console.warn("[nook] could not read selection on this tab:", err);
      showStatus("Can't read this page", true);
      return;
    }

    if (!selectionText.trim()) {
      showStatus("Select some text on the page first", true);
      return;
    }

    const res = await chrome.runtime.sendMessage({
      type: "nook-save-selection",
      selectionText,
      pageUrl: tab.url,
      favicon: tab.favIconUrl,
    });
    if (res?.ok) {
      showStatus("Saved selection ✓");
      await renderRecent();
    } else {
      showStatus("Couldn't save selection", true);
    }
  } finally {
    btn.disabled = false;
  }
});

el("openBoardsBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("newtab.html#boards") });
});

renderRecent();
