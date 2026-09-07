/**
 * Marks a tab as "accessed by V.A.R.M.A" using Chrome's native tab-group
 * label/color — the same mechanism (and the closest visual equivalent)
 * Claude in Chrome uses to badge the tab it's currently working in. There's
 * no API for an extension to draw into Chrome's own tab strip beyond this,
 * so a named, colored tab group is the real equivalent.
 */

const GROUP_TITLE = "V.A.R.M.A";
// varma-signal (#38e0f5, see index.css) is a bright cyan — "cyan" is the
// closest match in Chrome's fixed tab-group color palette (no arbitrary hex
// is allowed here).
const GROUP_COLOR: chrome.tabGroups.ColorEnum = "cyan";

export async function markTabAccessedByVarma(tabId: number): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.tabGroups || !chrome.tabs?.group) return;

  try {
    const tab = await chrome.tabs.get(tabId);

    if (typeof tab.groupId === "number" && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      const currentGroup = await chrome.tabGroups.get(tab.groupId).catch(() => null);
      if (currentGroup?.title === GROUP_TITLE) return; // already tagged
    }

    let groupId: number | undefined;
    if (typeof tab.windowId === "number") {
      const existing = await chrome.tabGroups.query({ windowId: tab.windowId, title: GROUP_TITLE });
      groupId = existing[0]?.id;
    }

    if (typeof groupId === "number") {
      await chrome.tabs.group({ tabIds: [tabId], groupId });
    } else {
      groupId = await chrome.tabs.group({ tabIds: [tabId] });
      await chrome.tabGroups.update(groupId, { title: GROUP_TITLE, color: GROUP_COLOR });
    }
  } catch (err) {
    // Grouping can fail on restricted pages (chrome://, the Web Store, etc.)
    // — never let a cosmetic tag block anything else in the extension.
    console.warn("[varma] Could not tag tab as accessed:", err);
  }
}
