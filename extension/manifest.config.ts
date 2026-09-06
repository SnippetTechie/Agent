import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

/**
 * Side panel extension, not a popup: clicking the toolbar icon opens the
 * persistent side panel (chrome.sidePanel.setPanelBehavior in
 * background/index.ts) instead of a transient popup — this is what lets
 * the panel stay open across page navigations and tab switches, matching
 * Claude in Chrome's UX.
 */
export default defineManifest({
  manifest_version: 3,
  // __MSG_*__ placeholders are resolved from public/_locales/<lang>/messages.json
  // at runtime by Chrome itself — this is the standard extension-level i18n
  // mechanism (separate from the in-app UI language switcher, which
  // translates the side panel's own content instead of chrome://extensions).
  default_locale: "en",
  name: "__MSG_extensionName__",
  short_name: "V.A.R.M.A",
  description: "__MSG_extensionDescription__",
  version: pkg.version,
  action: {},
  side_panel: {
    default_path: "src/sidepanel/sidepanel.html",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  // <all_urls> allows capturing visible tabs. Localhost origins allow POSTing
  // captured screenshots to the local receiver without popup dialogs.
  permissions: ["sidePanel", "activeTab", "storage"],
  host_permissions: ["<all_urls>", "http://127.0.0.1:8000/*", "http://localhost:8000/*"],
  icons: {
    16: "public/icons/icon16.png",
    48: "public/icons/icon48.png",
    128: "public/icons/icon128.png",
  },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self';",
  },
});
