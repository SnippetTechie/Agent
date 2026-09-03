import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SidePanel } from "./SidePanel.js";
import { I18nProvider } from "./lib/i18n/I18nContext.js";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root element not found");

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <SidePanel />
    </I18nProvider>
  </StrictMode>
);
