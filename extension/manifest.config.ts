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
  // <all_urls> lets the panel read the active tab's URL/favicon for context.
  // Localhost origins allow talking to the local receiver without popups.
  // tabGroups lets V.A.R.M.A visually mark the tab it currently has access
  // to (lib/tabAccess.ts, called from lib/activeTab.ts on every active-tab
  // read), the same way Claude in Chrome labels the tab it's working in.
  permissions: [
    "sidePanel",
    "activeTab",
    "scripting",
    "tabs",
    "storage",
    "tabGroups",
    "identity",
  ],
  host_permissions: [
    "<all_urls>",
    "http://127.0.0.1:8000/*",
    "http://localhost:8000/*",
    "http://127.0.0.1:8002/*",
    "http://localhost:8002/*",
    "ws://127.0.0.1:8002/*",
    "ws://localhost:8002/*",
    "https://*.supabase.co/*",
    "https://accounts.google.com/*",
    "https://www.googleapis.com/*",
  ],
  icons: {
    16: "public/icons/icon16.png",
    48: "public/icons/icon48.png",
    128: "public/icons/icon128.png",
  },
  content_security_policy: {
    // script-src 'self' keeps extension scripts locked down.
    // connect-src is an explicit allowlist once specified at all — it does
    // NOT fall back to "everything else stays open" for what's omitted, so
    // every origin the side panel's own fetch()/WebSocket calls ever hit
    // must be listed here or those requests get silently blocked:
    //   - 127.0.0.1/localhost:8002 (http + ws) -> lib/capture.ts (/chat)
    //     and lib/agentWebSocket.ts (/ws/agent) talking to server/receiver.py
    //   - 127.0.0.1/localhost:8000 -> not currently called directly by the
    //     extension (receiver.py calls vLLM itself, server-side), included
    //     for parity with host_permissions in case that ever changes
    //   - wss/https://www.google.com -> Chrome's Web Speech API
    //     (webkitSpeechRecognition, lib/speech.ts) streams audio over a
    //     WebSocket to Google's speech service internally; without this,
    //     recognition starts but immediately errors with no transcript
    extension_pages:
      "script-src 'self'; object-src 'self'; connect-src 'self' http: https: ws: wss:;",
  },
});
