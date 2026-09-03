// Opens the side panel on the toolbar icon click instead of a popup — the
// side panel persists across navigations/tab switches, matching the
// Claude-in-Chrome sidebar interaction model this UI mirrors.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("[V.A.R.M.A] setPanelBehavior failed:", err));
