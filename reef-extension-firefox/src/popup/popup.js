// src/popup/popup.ts
var activeTabId = null;
var currentMode = "page";
var pageFilter = "all";
var pageQuery = "";
var pageResults = [];
var tabQuery = "";
var tabResults = [];
var libFilter = "bookmarks";
var libQuery = "";
var bookmarksCache = [];
var snippetsCache = [];
var notesCache = [];
var recentsCache = [];
document.addEventListener("DOMContentLoaded", async () => {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    const { theme } = await chrome.storage.local.get(["theme"]);
    document.body.setAttribute("data-theme", theme || "light");
  }
  const searchInput = document.getElementById("search-input");
  const clearBtn = document.getElementById("btn-clear");
  const optionsBtn = document.getElementById("btn-options");
  const filterTabs = document.getElementById("filter-tabs");
  const resultsContainer = document.getElementById("results-container");
  const manifestBadge = document.getElementById("manifest-badge");
  const statsLabel = document.getElementById("stats-label");
  const modeTabs = document.getElementById("mode-tabs");
  const panels = document.querySelectorAll(".mode-panel");
  const tabSearchInput = document.getElementById("tab-search-input");
  const tabSearchClear = document.getElementById("tab-search-clear");
  const tabsContainer = document.getElementById("tabs-container");
  const libSearchInput = document.getElementById("library-search-input");
  const libSearchClear = document.getElementById("library-search-clear");
  const libTabs = document.getElementById("library-tabs");
  const libContainer = document.getElementById("library-container");
  optionsBtn.addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else window.open(chrome.runtime.getURL("src/options/options.html"));
  });
  modeTabs.addEventListener("click", (e) => {
    const t = e.target;
    if (!t.classList.contains("mode-tab")) return;
    const mode = t.dataset.mode;
    if (mode === currentMode) return;
    currentMode = mode;
    modeTabs.querySelectorAll(".mode-tab").forEach((b) => {
      const active = b === t;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    panels.forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== mode));
    if (mode === "page") {
      renderPageResults();
    } else if (mode === "tabs") {
      runTabSearch();
    } else if (mode === "library") {
      loadLibrary();
    }
  });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    activeTabId = tab.id;
    await performPageSearch();
  } else {
    resultsContainer.innerHTML = '<div class="empty-state">No active tab accessible.</div>';
  }
  searchInput.addEventListener("input", () => {
    pageQuery = searchInput.value;
    clearBtn.classList.toggle("hidden", !pageQuery);
    performPageSearch();
  });
  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    pageQuery = "";
    clearBtn.classList.add("hidden");
    searchInput.focus();
    performPageSearch();
  });
  filterTabs.addEventListener("click", (e) => {
    const target = e.target;
    if (target.classList.contains("tab-btn")) {
      filterTabs.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
      target.classList.add("active");
      pageFilter = target.dataset.type || "all";
      renderPageResults();
    }
  });
  var pageSuggestion = void 0;
  var pageAutocorrected = false;
  var pageSuggestionsList = [];
  async function performPageSearch() {
    if (!activeTabId) return;
    resultsContainer.innerHTML = '<div class="loading-state">Searching page...</div>';
    chrome.runtime.sendMessage(
      { type: "SEARCH_CURRENT_TAB", tabId: activeTabId, query: pageQuery },
      (response) => {
        if (!response || !response.success) {
          resultsContainer.replaceChildren();
          const empty = document.createElement("div");
          empty.className = "empty-state";
          empty.textContent = `Failed to index page. ${response?.error || ""}`;
          resultsContainer.appendChild(empty);
          return;
        }
        if (response.manifest?.version) {
          manifestBadge.textContent = "Agent-Ready Site";
          manifestBadge.classList.add("authoritative");
        } else {
          manifestBadge.textContent = "Dynamic Extract";
          manifestBadge.classList.remove("authoritative");
        }
        pageResults = response.results || [];
        pageSuggestion = response.suggestion;
        pageAutocorrected = !!response.autocorrected;
        pageSuggestionsList = response.suggestions || [];
        renderPageResults();
      }
    );
  }
  function renderPageResults() {
    if (currentMode !== "page") return;
    let filtered2 = pageResults;
    if (pageFilter !== "all") filtered2 = pageResults.filter((r) => r.type === pageFilter);
    statsLabel.textContent = `${filtered2.length} items found`;
    resultsContainer.innerHTML = "";
    if (pageAutocorrected && pageSuggestion) {
      const banner = document.createElement("div");
      banner.className = "autocorrect-banner";
      const label = document.createElement("span");
      label.textContent = `Showing fuzzy matches. Did you mean `;
      const link = document.createElement("a");
      link.className = "autocorrect-link";
      link.textContent = pageSuggestion;
      link.href = "#";
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const searchInput = document.getElementById("search-input");
        if (searchInput) {
          searchInput.value = pageSuggestion;
          pageQuery = pageSuggestion;
          performPageSearch();
        }
      });
      label.appendChild(link);
      const q = document.createTextNode("?");
      label.appendChild(q);
      banner.appendChild(label);
      resultsContainer.appendChild(banner);
    }
    if (pageSuggestionsList.length > 0 && !pageAutocorrected) {
      const chips = document.createElement("div");
      chips.className = "suggestion-chips";
      for (const s of pageSuggestionsList.slice(0, 5)) {
        const chip = document.createElement("button");
        chip.className = "suggestion-chip";
        chip.textContent = s;
        chip.addEventListener("click", () => {
          const searchInput = document.getElementById("search-input");
          if (searchInput) {
            searchInput.value = s;
            pageQuery = s;
            performPageSearch();
          }
        });
        chips.appendChild(chip);
      }
      resultsContainer.appendChild(chips);
    }
    if (filtered2.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No matching records found.";
      resultsContainer.appendChild(empty);
      return;
    }
    filtered2.forEach((record) => {
      const card = document.createElement("div");
      card.className = "result-card";
      const topRow = document.createElement("div");
      topRow.className = "card-top";
      const title = document.createElement("span");
      title.className = "card-title";
      title.textContent = record.headingText || record.label || record.url;
      const typePill = document.createElement("span");
      typePill.className = `type-pill ${record.type}`;
      typePill.textContent = record.type;
      topRow.appendChild(title);
      topRow.appendChild(typePill);
      card.appendChild(topRow);
      if (record.bodyText) {
        const snippet = document.createElement("div");
        snippet.className = "card-snippet";
        snippet.textContent = record.bodyText;
        card.appendChild(snippet);
      }
      const actionsRow = document.createElement("div");
      actionsRow.className = "card-actions";
      const bookmarkBtn = document.createElement("button");
      bookmarkBtn.className = "mini-btn";
      bookmarkBtn.title = "Bookmark this record";
      bookmarkBtn.textContent = "\u2605";
      bookmarkBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        bookmarkRecord(record);
      });
      actionsRow.appendChild(bookmarkBtn);
      const runBtn = document.createElement("button");
      runBtn.className = `run-btn ${record.destructive ? "destructive" : ""}`;
      runBtn.textContent = record.type === "action" || record.type === "link" ? record.destructive ? "\u26A0\uFE0F Run (Confirm)" : "Execute" : record.type === "field" ? "Fill Field" : "View";
      runBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        executePageAction(record);
      });
      actionsRow.appendChild(runBtn);
      card.appendChild(actionsRow);
      card.addEventListener("click", () => {
        if (activeTabId) {
          chrome.tabs.sendMessage(activeTabId, { type: "HIGHLIGHT_RECORD", record });
        }
      });
      resultsContainer.appendChild(card);
    });
  }
  function executePageAction(record) {
    if (!activeTabId) return;
    let valueToType;
    if (record.type === "field") {
      const input = prompt(`Enter value for field "${record.headingText || record.label || "Input"}":`, record.value || "");
      if (input === null) return;
      valueToType = input;
    }
    chrome.runtime.sendMessage({
      type: "EXECUTE_TAB_ACTION",
      tabId: activeTabId,
      record,
      actionType: record.type === "field" ? "type" : "click",
      value: valueToType
    }, (res) => {
      if (res && res.success) window.close();
      else alert(`Action failed: ${res?.error || "Unknown error"}`);
    });
  }
  function bookmarkRecord(record) {
    chrome.runtime.sendMessage({
      type: "LIBRARY_BOOKMARK_CREATE",
      data: {
        url: record.url || location.href,
        title: record.headingText || record.label || record.url || "Bookmark",
        selectedText: record.bodyText,
        selector: record.selector,
        note: "",
        tags: []
      }
    }, (res) => {
      flashStats(res?.success ? "Bookmarked" : "Bookmark failed");
    });
  }
  let tabDebounce = null;
  tabSearchInput.addEventListener("input", () => {
    tabQuery = tabSearchInput.value;
    tabSearchClear.classList.toggle("hidden", !tabQuery);
    if (tabDebounce) window.clearTimeout(tabDebounce);
    tabDebounce = window.setTimeout(runTabSearch, 150);
  });
  tabSearchClear.addEventListener("click", () => {
    tabSearchInput.value = "";
    tabQuery = "";
    tabSearchClear.classList.add("hidden");
    tabResults = [];
    runTabSearch();
    tabSearchInput.focus();
  });
  function runTabSearch() {
    if (currentMode !== "tabs") return;
    if (!tabQuery.trim()) {
      fetchOpenTabs();
      return;
    }
    chrome.runtime.sendMessage({ type: "TAB_SEARCH", query: tabQuery, limit: 30 }, (res) => {
      if (!res?.success) {
        tabsContainer.innerHTML = '<div class="empty-state">Tab search unavailable.</div>';
        return;
      }
      tabResults = res.items || [];
      renderTabResults();
    });
  }
  function renderTabResults() {
    if (currentMode !== "tabs") return;
    statsLabel.textContent = `${tabResults.length} tab${tabResults.length === 1 ? "" : "s"}`;
    if (tabResults.length === 0) {
      tabsContainer.innerHTML = '<div class="empty-state">No matching tabs.</div>';
      return;
    }
    tabsContainer.innerHTML = "";
    tabResults.forEach((item) => {
      const card = document.createElement("div");
      card.className = "result-card";
      const topRow = document.createElement("div");
      topRow.className = "card-top";
      const title = document.createElement("span");
      title.className = "card-title";
      title.textContent = item.title || item.url;
      const url = document.createElement("span");
      url.className = "card-url";
      url.textContent = shortHost(item.url);
      topRow.appendChild(title);
      topRow.appendChild(url);
      card.appendChild(topRow);
      if (item.matchedRecords?.length) {
        const snippet = document.createElement("div");
        snippet.className = "card-snippet";
        snippet.textContent = item.matchedRecords.map((r) => r.headingText).filter(Boolean).join(" \xB7 ");
        card.appendChild(snippet);
      }
      const actionsRow = document.createElement("div");
      actionsRow.className = "card-actions";
      const switchBtn = document.createElement("button");
      switchBtn.className = "run-btn";
      switchBtn.textContent = "Switch to tab";
      switchBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage({
          type: "TAB_SWITCH",
          tabId: item.tabId,
          windowId: item.windowId
        });
        window.close();
      });
      actionsRow.appendChild(switchBtn);
      card.appendChild(actionsRow);
      tabsContainer.appendChild(card);
    });
  }
  async function fetchOpenTabs() {
    tabsContainer.innerHTML = '<div class="loading-state">Loading tabs...</div>';
    chrome.runtime.sendMessage({ type: "LIST_OPEN_TABS" }, (res) => {
      if (!res?.success) {
        tabsContainer.innerHTML = '<div class="empty-state">Tab list unavailable.</div>';
        return;
      }
      tabResults = res.items || [];
      renderTabResults();
    });
  }
  let libDebounce = null;
  libSearchInput.addEventListener("input", () => {
    libQuery = libSearchInput.value;
    libSearchClear.classList.toggle("hidden", !libQuery);
    if (libDebounce) window.clearTimeout(libDebounce);
    libDebounce = window.setTimeout(renderLibrary, 120);
  });
  libSearchClear.addEventListener("click", () => {
    libSearchInput.value = "";
    libQuery = "";
    libSearchClear.classList.add("hidden");
    renderLibrary();
  });
  libTabs.addEventListener("click", (e) => {
    const t = e.target;
    if (!t.classList.contains("tab-btn")) return;
    libTabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    t.classList.add("active");
    libFilter = t.dataset.lib || "bookmarks";
    renderLibrary();
  });
  async function loadLibrary() {
    if (currentMode !== "library") return;
    libContainer.innerHTML = '<div class="loading-state">Loading library\u2026</div>';
    const req = (type) => new Promise((resolve) => {
      chrome.runtime.sendMessage({ type }, (res) => resolve(res));
    });
    const [bm, sn, nt, rc] = await Promise.all([
      req("LIBRARY_BOOKMARK_LIST"),
      req("LIBRARY_SNIPPET_LIST"),
      req("LIBRARY_NOTE_LIST"),
      req("LIBRARY_RECENTS_LIST")
    ]);
    bookmarksCache = bm?.items || [];
    snippetsCache = sn?.items || [];
    notesCache = nt?.items || [];
    recentsCache = rc?.items || [];
    renderLibrary();
  }
  function renderLibrary() {
    if (currentMode !== "library") return;
    if (libFilter === "bookmarks") return renderBookmarks();
    if (libFilter === "snippets") return renderSnippets();
    if (libFilter === "notes") return renderNotes();
    if (libFilter === "recents") return renderRecents();
  }
  function filtered(items, hayMaker) {
    let out = items;
    if (libQuery) {
      const q = libQuery.toLowerCase();
      out = out.filter((i) => hayMaker(i).toLowerCase().includes(q));
    }
    return out;
  }
  function renderBookmarks() {
    const items = filtered(bookmarksCache, (b) => [b.title, b.selectedText, b.note, (b.tags || []).join(" "), b.url].filter(Boolean).join(" "));
    statsLabel.textContent = `${items.length} bookmark${items.length === 1 ? "" : "s"}`;
    if (items.length === 0) {
      libContainer.innerHTML = '<div class="empty-state">No bookmarks yet. Right-click selected text or click \u2605 on a search result to save.</div>';
      return;
    }
    libContainer.innerHTML = "";
    items.forEach((b) => {
      const card = document.createElement("div");
      card.className = "result-card library-card";
      const topRow = document.createElement("div");
      topRow.className = "card-top";
      const title = document.createElement("span");
      title.className = "card-title";
      title.textContent = b.title || b.url;
      const pill = document.createElement("span");
      pill.className = "type-pill link";
      pill.textContent = "bookmark";
      topRow.appendChild(title);
      topRow.appendChild(pill);
      card.appendChild(topRow);
      if (b.selectedText) {
        const snip = document.createElement("div");
        snip.className = "card-snippet";
        snip.textContent = b.selectedText.slice(0, 220);
        card.appendChild(snip);
      }
      const meta = document.createElement("div");
      meta.className = "card-meta";
      meta.textContent = `${shortHost(b.url)} \xB7 ${formatDate(b.createdAt)}`;
      card.appendChild(meta);
      if (b.tags?.length) card.appendChild(tagRow(b.tags));
      const actions = document.createElement("div");
      actions.className = "card-actions";
      const openBtn = document.createElement("button");
      openBtn.className = "run-btn";
      openBtn.textContent = "Open";
      openBtn.addEventListener("click", () => {
        chrome.tabs.create({ url: b.url });
        window.close();
      });
      actions.appendChild(openBtn);
      const editBtn = document.createElement("button");
      editBtn.className = "mini-btn";
      editBtn.textContent = "\u270E";
      editBtn.title = "Edit note & tags";
      editBtn.addEventListener("click", () => editBookmark(b));
      actions.appendChild(editBtn);
      const delBtn = document.createElement("button");
      delBtn.className = "mini-btn danger";
      delBtn.textContent = "\xD7";
      delBtn.title = "Delete bookmark";
      delBtn.addEventListener("click", () => deleteBookmark(b.id));
      actions.appendChild(delBtn);
      card.appendChild(actions);
      libContainer.appendChild(card);
    });
  }
  function renderSnippets() {
    const items = filtered(snippetsCache, (s) => [s.title, s.text, (s.tags || []).join(" "), s.source?.title || ""].filter(Boolean).join(" "));
    statsLabel.textContent = `${items.length} snippet${items.length === 1 ? "" : "s"}`;
    if (items.length === 0) {
      libContainer.innerHTML = '<div class="empty-state">No snippets yet. Right-click selected text \u2192 "Save selection as snippet".</div>';
      return;
    }
    libContainer.innerHTML = "";
    items.forEach((s) => {
      const card = document.createElement("div");
      card.className = "result-card library-card";
      const topRow = document.createElement("div");
      topRow.className = "card-top";
      const title = document.createElement("span");
      title.className = "card-title";
      title.textContent = s.title || s.text.slice(0, 60);
      const pill = document.createElement("span");
      pill.className = "type-pill section";
      pill.textContent = "snippet";
      topRow.appendChild(title);
      topRow.appendChild(pill);
      card.appendChild(topRow);
      const body = document.createElement("pre");
      body.className = "card-pre";
      body.textContent = s.text;
      card.appendChild(body);
      if (s.source) {
        const meta = document.createElement("div");
        meta.className = "card-meta";
        meta.textContent = `from ${s.source.title || shortHost(s.source.url)} \xB7 ${formatDate(s.createdAt)}`;
        card.appendChild(meta);
      }
      if (s.tags?.length) card.appendChild(tagRow(s.tags));
      const actions = document.createElement("div");
      actions.className = "card-actions";
      const copyBtn = document.createElement("button");
      copyBtn.className = "run-btn";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(s.text);
          flashStats("Copied to clipboard");
        } catch {
          flashStats("Copy failed");
        }
      });
      actions.appendChild(copyBtn);
      const editBtn = document.createElement("button");
      editBtn.className = "mini-btn";
      editBtn.textContent = "\u270E";
      editBtn.title = "Edit snippet";
      editBtn.addEventListener("click", () => editSnippet(s));
      actions.appendChild(editBtn);
      const delBtn = document.createElement("button");
      delBtn.className = "mini-btn danger";
      delBtn.textContent = "\xD7";
      delBtn.title = "Delete snippet";
      delBtn.addEventListener("click", () => deleteSnippet(s.id));
      actions.appendChild(delBtn);
      card.appendChild(actions);
      libContainer.appendChild(card);
    });
  }
  function renderNotes() {
    const items = filtered(notesCache, (n) => [n.text, n.title, n.url].filter(Boolean).join(" "));
    statsLabel.textContent = `${items.length} note${items.length === 1 ? "" : "s"}`;
    if (items.length === 0) {
      libContainer.innerHTML = '<div class="empty-state">No page notes yet. Right-click the page \u2192 "Add note to this page".</div>';
      return;
    }
    libContainer.innerHTML = "";
    items.forEach((n) => {
      const card = document.createElement("div");
      card.className = "result-card library-card";
      const topRow = document.createElement("div");
      topRow.className = "card-top";
      const title = document.createElement("span");
      title.className = "card-title";
      title.textContent = n.title || n.url;
      const pill = document.createElement("span");
      pill.className = "type-pill field";
      pill.textContent = "note";
      topRow.appendChild(title);
      topRow.appendChild(pill);
      card.appendChild(topRow);
      const body = document.createElement("div");
      body.className = "card-snippet";
      body.style.webkitLineClamp = "6";
      body.textContent = n.text;
      card.appendChild(body);
      const meta = document.createElement("div");
      meta.className = "card-meta";
      meta.textContent = `${shortHost(n.url)} \xB7 ${formatDate(n.updatedAt)}`;
      card.appendChild(meta);
      const actions = document.createElement("div");
      actions.className = "card-actions";
      const openBtn = document.createElement("button");
      openBtn.className = "run-btn";
      openBtn.textContent = "Open page";
      openBtn.addEventListener("click", () => {
        chrome.tabs.create({ url: n.url });
        window.close();
      });
      actions.appendChild(openBtn);
      const editBtn = document.createElement("button");
      editBtn.className = "mini-btn";
      editBtn.textContent = "\u270E";
      editBtn.title = "Edit note";
      editBtn.addEventListener("click", () => editNote(n));
      actions.appendChild(editBtn);
      const delBtn = document.createElement("button");
      delBtn.className = "mini-btn danger";
      delBtn.textContent = "\xD7";
      delBtn.title = "Delete note";
      delBtn.addEventListener("click", () => deleteNote(n.url));
      actions.appendChild(delBtn);
      card.appendChild(actions);
      libContainer.appendChild(card);
    });
  }
  function renderRecents() {
    const items = recentsCache.slice(0, 25);
    statsLabel.textContent = `${items.length} recent`;
    if (items.length === 0) {
      libContainer.innerHTML = '<div class="empty-state">No recent pages yet. Visit some pages to build up history.</div>';
      return;
    }
    libContainer.innerHTML = "";
    items.forEach((p) => {
      const card = document.createElement("div");
      card.className = "result-card library-card";
      const topRow = document.createElement("div");
      topRow.className = "card-top";
      const title = document.createElement("span");
      title.className = "card-title";
      title.textContent = p.title || p.url;
      const pill = document.createElement("span");
      pill.className = "type-pill file";
      pill.textContent = `${p.recordCount} idx`;
      topRow.appendChild(title);
      topRow.appendChild(pill);
      card.appendChild(topRow);
      const meta = document.createElement("div");
      meta.className = "card-meta";
      meta.textContent = `${shortHost(p.url)} \xB7 ${formatDate(p.visitedAt)}`;
      card.appendChild(meta);
      const actions = document.createElement("div");
      actions.className = "card-actions";
      const openBtn = document.createElement("button");
      openBtn.className = "run-btn";
      openBtn.textContent = "Open";
      openBtn.addEventListener("click", () => {
        chrome.tabs.create({ url: p.url });
        window.close();
      });
      actions.appendChild(openBtn);
      const bkBtn = document.createElement("button");
      bkBtn.className = "mini-btn";
      bkBtn.textContent = "\u2605";
      bkBtn.title = "Bookmark this page";
      bkBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage({
          type: "LIBRARY_BOOKMARK_CREATE",
          data: { url: p.url, title: p.title, note: "", tags: [], favicon: p.favicon }
        }, (res) => {
          flashStats(res?.success ? "Bookmarked" : "Bookmark failed");
          if (res?.success) loadLibrary();
        });
      });
      actions.appendChild(bkBtn);
      card.appendChild(actions);
      libContainer.appendChild(card);
    });
  }
  function editBookmark(b) {
    const note = prompt("Note for this bookmark:", b.note || "");
    if (note === null) return;
    const tagsRaw = prompt("Tags (comma separated):", (b.tags || []).join(", "));
    if (tagsRaw === null) return;
    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
    chrome.runtime.sendMessage(
      { type: "LIBRARY_BOOKMARK_UPDATE", id: b.id, data: { note, tags } },
      (res) => {
        if (res?.success) {
          b.note = note;
          b.tags = tags;
          flashStats("Bookmark updated");
        }
      }
    );
  }
  function deleteBookmark(id) {
    if (!confirm("Delete this bookmark?")) return;
    chrome.runtime.sendMessage({ type: "LIBRARY_BOOKMARK_DELETE", id }, (res) => {
      if (res?.success) {
        bookmarksCache = bookmarksCache.filter((b) => b.id !== id);
        renderLibrary();
      }
    });
  }
  function editSnippet(s) {
    const title = prompt("Snippet title:", s.title);
    if (title === null) return;
    const text = prompt("Snippet text:", s.text);
    if (text === null) return;
    const tagsRaw = prompt("Tags (comma separated):", (s.tags || []).join(", "));
    if (tagsRaw === null) return;
    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
    chrome.runtime.sendMessage(
      { type: "LIBRARY_SNIPPET_UPDATE", id: s.id, data: { title, text, tags } },
      (res) => {
        if (res?.success) {
          s.title = title;
          s.text = text;
          s.tags = tags;
          flashStats("Snippet updated");
        }
      }
    );
  }
  function deleteSnippet(id) {
    if (!confirm("Delete this snippet?")) return;
    chrome.runtime.sendMessage({ type: "LIBRARY_SNIPPET_DELETE", id }, (res) => {
      if (res?.success) {
        snippetsCache = snippetsCache.filter((s) => s.id !== id);
        renderLibrary();
      }
    });
  }
  function editNote(n) {
    const text = prompt("Note text:", n.text);
    if (text === null) return;
    chrome.runtime.sendMessage(
      { type: "LIBRARY_NOTE_SET", url: n.url, text, title: n.title },
      (res) => {
        if (res?.success) {
          n.text = text;
          flashStats("Note updated");
          loadLibrary();
        }
      }
    );
  }
  function deleteNote(url) {
    if (!confirm("Delete this note?")) return;
    chrome.runtime.sendMessage({ type: "LIBRARY_NOTE_DELETE", url }, (res) => {
      if (res?.success) {
        notesCache = notesCache.filter((n) => n.url !== url);
        renderLibrary();
      }
    });
  }
  function tagRow(tags) {
    const row = document.createElement("div");
    row.className = "tag-row";
    tags.forEach((t) => {
      const tag = document.createElement("span");
      tag.className = "tag-chip";
      tag.textContent = `#${t}`;
      row.appendChild(tag);
    });
    return row;
  }
  function shortHost(url) {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }
  function formatDate(ts) {
    const diff = Date.now() - ts;
    if (diff < 6e4) return "just now";
    if (diff < 36e5) return `${Math.floor(diff / 6e4)}m ago`;
    if (diff < 864e5) return `${Math.floor(diff / 36e5)}h ago`;
    return new Date(ts).toLocaleDateString();
  }
  function flashStats(msg) {
    const original = statsLabel.textContent;
    statsLabel.textContent = msg;
    statsLabel.classList.add("flash");
    setTimeout(() => {
      statsLabel.classList.remove("flash");
      statsLabel.textContent = original;
    }, 1500);
  }
});
//# sourceMappingURL=popup.js.map
