// src/options/options.ts
var DEFAULTS = {
  actionsMode: "execute",
  confirmDestructive: true,
  autoExecute: false,
  exclusionSelectors: [],
  blockedDomains: [],
  telemetryEnabled: false,
  enableCrossTabCrawl: false,
  pageSize: 20,
  scoringAlgorithm: "default",
  fuzzyEnabled: true,
  diversifyResults: false,
  theme: "light",
  compactMode: false
};
document.addEventListener("DOMContentLoaded", async () => {
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".settings-section");
  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const target = item.dataset.section;
      if (!target) return;
      navItems.forEach((n) => n.classList.remove("active"));
      item.classList.add("active");
      sections.forEach((s) => s.classList.remove("visible"));
      const section = document.getElementById(`section-${target}`);
      if (section) section.classList.add("visible");
    });
  });
  const actionsModeControl = document.getElementById("actions-mode-control");
  const confirmDestructive = document.getElementById("confirm-destructive");
  const autoExecute = document.getElementById("auto-execute");
  const exclusionSelectorsInput = document.getElementById("exclusion-selectors");
  const blockedDomainsInput = document.getElementById("blocked-domains");
  const telemetryEnabled = document.getElementById("telemetry-enabled");
  const enableCrossTabCrawl = document.getElementById("enable-cross-tab-crawl");
  const pageSizeInput = document.getElementById("page-size");
  const scoringControl = document.getElementById("scoring-control");
  const themeControl = document.getElementById("theme-control");
  const compactMode = document.getElementById("compact-mode");
  const fuzzyEnabled = document.getElementById("fuzzy-enabled");
  const diversifyResults = document.getElementById("diversify-results");
  const saveBtn = document.getElementById("btn-save");
  const exportBtn = document.getElementById("btn-export");
  const importBtn = document.getElementById("btn-import");
  const clearCacheBtn = document.getElementById("btn-clear-cache");
  const clearHistoryBtn = document.getElementById("btn-clear-history");
  const resetBtn = document.getElementById("btn-reset");
  const saveStatus = document.getElementById("save-status");
  function setupSegmented(control, callback) {
    const buttons = control.querySelectorAll(".seg-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        callback(btn.dataset.value || "");
      });
    });
  }
  let selectedActionsMode = DEFAULTS.actionsMode;
  let selectedScoring = DEFAULTS.scoringAlgorithm;
  let selectedTheme = DEFAULTS.theme;
  setupSegmented(actionsModeControl, (value) => {
    selectedActionsMode = value;
  });
  setupSegmented(scoringControl, (value) => {
    selectedScoring = value;
  });
  setupSegmented(themeControl, (value) => {
    selectedTheme = value;
    applyTheme(selectedTheme);
  });
  function applyTheme(theme) {
    document.body.setAttribute("data-theme", theme);
  }
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    const data = await chrome.storage.local.get(Object.keys(DEFAULTS));
    selectedActionsMode = data.actionsMode || DEFAULTS.actionsMode;
    actionsModeControl.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.value === selectedActionsMode);
    });
    confirmDestructive.checked = data.confirmDestructive ?? DEFAULTS.confirmDestructive;
    autoExecute.checked = data.autoExecute ?? DEFAULTS.autoExecute;
    exclusionSelectorsInput.value = (data.exclusionSelectors || DEFAULTS.exclusionSelectors).join(", ");
    blockedDomainsInput.value = (data.blockedDomains || DEFAULTS.blockedDomains).join("\n");
    telemetryEnabled.checked = data.telemetryEnabled ?? DEFAULTS.telemetryEnabled;
    enableCrossTabCrawl.checked = data.enableCrossTabCrawl ?? DEFAULTS.enableCrossTabCrawl;
    pageSizeInput.value = String(data.pageSize ?? DEFAULTS.pageSize);
    selectedScoring = data.scoringAlgorithm || DEFAULTS.scoringAlgorithm;
    scoringControl.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.value === selectedScoring);
    });
    fuzzyEnabled.checked = data.fuzzyEnabled ?? DEFAULTS.fuzzyEnabled;
    diversifyResults.checked = data.diversifyResults ?? DEFAULTS.diversifyResults;
    selectedTheme = data.theme || DEFAULTS.theme;
    themeControl.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.value === selectedTheme);
    });
    applyTheme(selectedTheme);
    compactMode.checked = data.compactMode ?? DEFAULTS.compactMode;
  }
  async function saveSettings() {
    const settings = {
      actionsMode: selectedActionsMode,
      confirmDestructive: confirmDestructive.checked,
      autoExecute: autoExecute.checked,
      exclusionSelectors: exclusionSelectorsInput.value.split(",").map((s) => s.trim()).filter(Boolean),
      blockedDomains: blockedDomainsInput.value.split("\n").map((s) => s.trim()).filter(Boolean),
      telemetryEnabled: telemetryEnabled.checked,
      enableCrossTabCrawl: enableCrossTabCrawl.checked,
      pageSize: parseInt(pageSizeInput.value, 10) || DEFAULTS.pageSize,
      scoringAlgorithm: selectedScoring,
      fuzzyEnabled: fuzzyEnabled.checked,
      diversifyResults: diversifyResults.checked,
      theme: selectedTheme,
      compactMode: compactMode.checked
    };
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set(settings);
      showSaveStatus("Settings saved");
    }
  }
  saveBtn.addEventListener("click", saveSettings);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveSettings();
    }
  });
  exportBtn.addEventListener("click", async () => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    const data = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reef-settings.json";
    a.click();
    URL.revokeObjectURL(url);
    showSaveStatus("Settings exported");
  });
  importBtn.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          await chrome.storage.local.set(data);
          showSaveStatus("Settings imported \u2014 reload page to apply");
          setTimeout(() => location.reload(), 1500);
        }
      } catch {
        showSaveStatus("Import failed: invalid file");
      }
    });
    input.click();
  });
  clearCacheBtn.addEventListener("click", async () => {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.remove(["cachedIndices", "siteIndices"]);
      showSaveStatus("Cache cleared");
    }
  });
  clearHistoryBtn.addEventListener("click", async () => {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.remove(["queryHistory", "popularQueries"]);
      showSaveStatus("History cleared");
    }
  });
  resetBtn.addEventListener("click", async () => {
    if (!confirm("Reset all settings to defaults? This cannot be undone.")) return;
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.clear();
      await chrome.storage.local.set(DEFAULTS);
      showSaveStatus("Settings reset to defaults");
      setTimeout(() => location.reload(), 1e3);
    }
  });
  function showSaveStatus(msg) {
    saveStatus.textContent = msg;
    saveStatus.classList.remove("hidden");
    setTimeout(() => saveStatus.classList.add("hidden"), 2500);
  }
});
//# sourceMappingURL=options.js.map
