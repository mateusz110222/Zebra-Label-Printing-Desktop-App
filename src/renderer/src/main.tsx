import "./assets/main.css";
import "./i18n";

import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary, PageSkeleton } from "@renderer/components";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <Suspense fallback={<PageSkeleton />}>
        <App />
      </Suspense>
    </AppErrorBoundary>
  </StrictMode>,
);
