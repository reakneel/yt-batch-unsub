const whitelistEl = document.getElementById("whitelist");
const saveBtn = document.getElementById("saveWhitelist");
const historyList = document.getElementById("historyList");

chrome.storage.local.get(["ytWhitelist"], result => {
  whitelistEl.value = (result.ytWhitelist || []).join("\n");
});

saveBtn.onclick = () => {
  const list = whitelistEl.value
    .split("\n")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  chrome.storage.local.set({ ytWhitelist: list }, () => {
    saveBtn.textContent = "Saved ✓";
    setTimeout(() => saveBtn.textContent = "Save Whitelist", 1400);
  });
};

function loadHistory() {
  chrome.storage.local.get(["ytHistory"], result => {
    const history = result.ytHistory || [];
    if (history.length === 0) {
      historyList.innerHTML = "<div style='color:#888;padding:8px 0'>No history yet</div>";
      return;
    }

    historyList.innerHTML = history.slice(0, 40).map((item, idx) => `
      <div class="history-item">
        <span title="${item.name}">${item.name.slice(0, 28)}${item.name.length > 28 ? "…" : ""}</span>
        <button data-idx="${idx}">Resubscribe</button>
      </div>
    `).join("");

    historyList.querySelectorAll("button").forEach(btn => {
      btn.onclick = () => {
        const item = history[btn.dataset.idx];
        if (item.url) {
          chrome.tabs.create({ url: item.url });
        } else {
          chrome.tabs.create({ url: `https://www.youtube.com/results?search_query=${encodeURIComponent(item.name)}` });
        }
      };
    });
  });
}

loadHistory();
