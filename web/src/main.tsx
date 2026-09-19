import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import "@/api/interceptors";
import { router } from "@/routes";
import AppProvider from "@/providers/AppProvider";

function SplashCleanup() {
  useEffect(() => {
    document.getElementById("ccst-boot-splash")?.remove();
  }, []);
  return null;
}

// TTI measurement: track boot sequence milestones.
// These are dev-only markers (stripped in production builds by Vite's
// terser minification of unused code paths — but kept here so devtools
// can show the timeline). In production they're harmless no-ops.
function markBootMilestone(name: string) {
  if (typeof performance !== "undefined" && performance.mark) {
    performance.mark(`ccst:${name}`);
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
    <SplashCleanup />
  </React.StrictMode>
);

markBootMilestone("react-mount");

// Remove the HTML splash only if React has already rendered (root has children).
// On fast connections this fires after React paints and removes the splash.
// On slow connections it sees an empty root and keeps the splash until React mounts
// and the useEffect above removes it — no more blank-page gap.
function tryRemoveSplash() {
  const splash = document.getElementById("ccst-boot-splash");
  const root = document.getElementById("root");
  if (splash && root && root.hasChildNodes()) {
    splash.remove();
    markBootMilestone("splash-remove");
    if (typeof performance !== "undefined" && performance.measure) {
      try {
        performance.measure("ccst:tti", "ccst:script-start", "ccst:splash-remove");
      } catch {
        // measure between marks that may not both exist
      }
    }
  } else if (!splash) {
    return;
  } else {
    requestAnimationFrame(tryRemoveSplash);
  }
}

markBootMilestone("script-start");
requestAnimationFrame(tryRemoveSplash);
