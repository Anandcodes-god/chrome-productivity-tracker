function updatePopup() {
  chrome.runtime.sendMessage({ action: "getData" }, (response) => {
    if (!response) return;

    const currentDomain = response.currentDomain;
    const todayData = response.today || {};
    
    const domainEl = document.getElementById("domain");
    const timeEl = document.getElementById("time");

    if (currentDomain) {
      domainEl.textContent = currentDomain;
      const seconds = todayData[currentDomain] || 0;
      timeEl.textContent = formatTime(seconds);
    } else {
      domainEl.textContent = "No Active Site";
      timeEl.textContent = "--";
    }
  });
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Update every second
setInterval(updatePopup, 1000);
updatePopup(); // Initial run

document.getElementById("open").addEventListener("click", () => {
  chrome.tabs.create({ url: "dashboard.html" });
});