let currentTabId = null;
let currentDomain = null;
let unsavedSeconds = {};

// 1. Helper: Get Domain from URL
function extractDomain(url) {
  try {
    if (!url || url.startsWith("chrome://") || url.startsWith("about:") || url.startsWith("extensions")) return null;
    return new URL(url).hostname.replace(/^www\./, "");
  } catch { return null; }
}

// 2. Helper: Save Data & Clean Old History
function saveUsage() {
  const todayKey = new Date().toISOString().split("T")[0];
  if (Object.keys(unsavedSeconds).length === 0) return;

  chrome.storage.local.get(null, (data) => {
    let todayData = data[todayKey] || {};
    
    // Merge buffer
    for (const domain in unsavedSeconds) {
      todayData[domain] = (todayData[domain] || 0) + unsavedSeconds[domain];
    }
    unsavedSeconds = {}; 

    // Prepare new data object
    let newData = {};
    newData[todayKey] = todayData;
    
    // Keep last 7 days of history
    const allKeys = Object.keys(data).filter(k => k !== todayKey && k.match(/^\d{4}-\d{2}-\d{2}$/));
    allKeys.sort().slice(-6).forEach(k => {
      newData[k] = data[k];
    });

    chrome.storage.local.set(newData);
  });
}

// 3. Message Listener (Serves data to Popup & Dashboard)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getData") {
    const todayKey = new Date().toISOString().split("T")[0];
    
    chrome.storage.local.get(null, (data) => {
      const storedToday = data[todayKey] || {};
      
      // Create real-time view by adding unsaved buffer
      const realTimeToday = { ...storedToday };
      for (const domain in unsavedSeconds) {
        realTimeToday[domain] = (realTimeToday[domain] || 0) + unsavedSeconds[domain];
      }
      
      sendResponse({
        today: realTimeToday,
        history: data,
        currentDomain: currentDomain
      });
    });
    return true; // Keep channel open
  }
});

// 4. Tracking Logic
function updateActiveTab(tabId) {
  currentTabId = tabId;
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab || !tab.url) {
      currentDomain = null;
      return;
    }
    currentDomain = extractDomain(tab.url);
  });
}

chrome.tabs.onActivated.addListener(info => updateActiveTab(info.tabId));
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (tabId === currentTabId && change.status === "complete") {
    currentDomain = extractDomain(tab.url);
  }
});

// Timer (1 second tick)
setInterval(() => {
  if (!currentDomain) return;
  unsavedSeconds[currentDomain] = (unsavedSeconds[currentDomain] || 0) + 1;
  if (unsavedSeconds[currentDomain] >= 10) saveUsage();
}, 1000);

// Heartbeat
chrome.alarms.create("heartbeat", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(saveUsage);