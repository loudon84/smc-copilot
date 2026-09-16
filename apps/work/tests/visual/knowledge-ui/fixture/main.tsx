import "../../../../src/renderer/src/assets/main.css";
import "../../../../src/renderer/src/components/ui/ui.css";
import "./visual.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../../../../src/renderer/src/components/I18nProvider";
import { ThemeProvider } from "../../../../src/renderer/src/components/ThemeProvider";
import { KnowledgeUiVisualApp } from "./KnowledgeUiVisualApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <KnowledgeUiVisualApp />
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
);
