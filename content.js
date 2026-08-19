(() => {
  if (window.__ytBatchUnsubLoaded) return;
  window.__ytBatchUnsubLoaded = true;

  const VERSION = "1.2.0";
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  let isRunning = false;
  let stopRequested = false;
  let whitelist = new Set();

  async function loadWhitelist() {
    return new Promise(resolve => {
      chrome.storage.local.get(["ytWhitelist"], result => {
        whitelist = new Set((result.ytWhitelist || []).map(u => u.toLowerCase().trim()));
        resolve();
      });
    });
  }

  async function saveToHistory(channelName, channelUrl) {
    return new Promise(resolve => {
      chrome.storage.local.get(["ytHistory"], result => {
        const history = result.ytHistory || [];
        history.unshift({
          name: channelName,
          url: channelUrl || "",
          time: Date.now()
        });
        if (history.length > 300) history.length = 300;
        chrome.storage.local.set({ ytHistory: history }, resolve);
      });
    });
  }

  function createToolbar() {
    if (document.getElementById("yt-batch-toolbar")) return;

    const bar = document.createElement("div");
    bar.id = "yt-batch-toolbar";
    bar.innerHTML = `
      <h3>YouTube Batch Unsubscribe</h3>
      <div class="version">v${VERSION}</div>

      <input type="text" id="yt-search" placeholder="Search channel name..." />

      <div class="row">
        <button id="yt-select-visible">Select Visible</button>
        <button id="yt-select-20" class="secondary">Next 20</button>
        <button id="yt-select-50" class="secondary">Next 50</button>
      </div>
      <div class="row">
        <button id="yt-deselect" class="secondary">Deselect All</button>
      </div>
      <div class="row">
        <button id="yt-start">Start Unsubscribe</button>
        <button id="yt-stop" class="danger" disabled>Stop</button>
      </div>
      <div class="status" id="yt-status">Ready</div>
    `;
    document.body.appendChild(bar);

    document.getElementById("yt-select-visible").onclick = () => selectByFilter(true);
    document.getElementById("yt-select-20").onclick = () => selectNext(20);
    document.getElementById("yt-select-50").onclick = () => selectNext(50);
    document.getElementById("yt-deselect").onclick = deselectAll;
    document.getElementById("yt-start").onclick = startUnsubscribe;
    document.getElementById("yt-stop").onclick = () => { stopRequested = true; };

    document.getElementById("yt-search").oninput = (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll("ytd-channel-renderer").forEach(r => {
        const name = getChannelName(r);
        r.style.display = (!q || name.includes(q)) ? "" : "none";
      });
    };
  }

  function getChannelName(renderer) {
    const el = renderer.querySelector("#channel-title") ||
               renderer.querySelector("a#main-link yt-formatted-string") ||
               renderer.querySelector("#text.ytd-channel-name") ||
               renderer.querySelector("yt-formatted-string#text");
    return (el?.textContent || el?.getAttribute("title") || "").trim().toLowerCase();
  }

  function getChannelUrl(renderer) {
    const a = renderer.querySelector("a#main-link") || renderer.querySelector("a[href*='/@']") || renderer.querySelector("a[href*='/channel/']");
    return a ? a.href : "";
  }

  function addCheckboxes() {
    document.querySelectorAll("ytd-channel-renderer").forEach(renderer => {
      if (renderer.querySelector(".yt-batch-checkbox")) return;

      const name = getChannelName(renderer);
      if (!name) return;

      const isProtected = [...whitelist].some(w => name.includes(w) || w.includes(name));
      if (isProtected) {
        renderer.style.opacity = "0.4";
        return;
      }

      const meta = renderer.querySelector("#meta") || renderer.querySelector("#info-section") || renderer.querySelector("#details");
      if (!meta) return;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "yt-batch-checkbox";
      cb.dataset.name = name;
      meta.insertBefore(cb, meta.firstChild);
    });
  }

  function selectByFilter(allVisible = false) {
    const q = document.getElementById("yt-search")?.value.toLowerCase().trim() || "";
    document.querySelectorAll(".yt-batch-checkbox").forEach(cb => {
      const renderer = cb.closest("ytd-channel-renderer");
      if (!renderer || renderer.style.display === "none") return;
      const name = cb.dataset.name || "";
      cb.checked = allVisible || !q || name.includes(q);
    });
    updateStatus();
  }

  function selectNext(n) {
    let count = 0;
    document.querySelectorAll(".yt-batch-checkbox").forEach(cb => {
      if (count >= n) return;
      const renderer = cb.closest("ytd-channel-renderer");
      if (!renderer || renderer.style.display === "none") return;
      if (!cb.checked) {
        cb.checked = true;
        count++;
      }
    });
    updateStatus();
  }

  function deselectAll() {
    document.querySelectorAll(".yt-batch-checkbox").forEach(cb => cb.checked = false);
    updateStatus();
  }

  function updateStatus(extra = "") {
    const selected = document.querySelectorAll(".yt-batch-checkbox:checked").length;
    const el = document.getElementById("yt-status");
    if (el) el.textContent = `Selected: ${selected} | Protected: ${whitelist.size} ${extra}`;
  }

  async function startUnsubscribe() {
    if (isRunning) return;
    isRunning = true;
    stopRequested = false;

    const startBtn = document.getElementById("yt-start");
    const stopBtn = document.getElementById("yt-stop");
    startBtn.disabled = true;
    stopBtn.disabled = false;

    const checked = [...document.querySelectorAll(".yt-batch-checkbox:checked")];
    let done = 0;

    for (const cb of checked) {
      if (stopRequested) break;

      const renderer = cb.closest("ytd-channel-renderer");
      if (!renderer) continue;

      const name = cb.dataset.name || getChannelName(renderer);
      const url = getChannelUrl(renderer);

      const unsubBtn = renderer.querySelector('[aria-label^="Unsubscribe from"]') ||
                       renderer.querySelector('ytd-subscribe-button-renderer button') ||
                       renderer.querySelector('#subscribe-button button');

      if (!unsubBtn) continue;

      unsubBtn.click();
      await sleep(700);

      const confirm =
        document.querySelector("yt-confirm-dialog-renderer #confirm-button button") ||
        document.querySelector("yt-confirm-dialog-renderer [aria-label*='Unsubscribe']") ||
        document.querySelector("#confirm-button button");

      if (confirm) {
        confirm.click();
        await sleep(500);
      }

      await saveToHistory(name, url);

      done++;
      cb.checked = false;
      cb.disabled = true;
      updateStatus(`| Done: ${done}/${checked.length}`);

      await sleep(rand(1200, 2200));
    }

    isRunning = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatus(stopRequested ? "| Stopped" : "| Finished");
  }

  let timer = null;
  function debouncedAdd() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      addCheckboxes();
      updateStatus();
    }, 500);
  }

  async function init() {
    try {
      await loadWhitelist();
      createToolbar();
      addCheckboxes();
      updateStatus();

      const observer = new MutationObserver(debouncedAdd);
      observer.observe(document.body, { childList: true, subtree: true });

      chrome.storage.onChanged.addListener(changes => {
        if (changes.ytWhitelist) {
          loadWhitelist().then(() => {
            document.querySelectorAll(".yt-batch-checkbox").forEach(c => c.remove());
            document.querySelectorAll("ytd-channel-renderer").forEach(r => r.style.opacity = "");
            addCheckboxes();
            updateStatus();
          });
        }
      });
    } catch (err) {
      console.error("YT Batch error:", err);
    }
  }

  function waitAndInit() {
    if (!location.href.includes("/feed/channels")) return;

    const check = setInterval(() => {
      if (document.querySelector("ytd-channel-renderer")) {
        clearInterval(check);
        setTimeout(init, 600);
      }
    }, 400);

    setTimeout(() => clearInterval(check), 12000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitAndInit);
  } else {
    waitAndInit();
  }
})();
