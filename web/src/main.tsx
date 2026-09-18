import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import "@/api/interceptors";
import { router } from "@/routes";
import AppProvider from "@/providers/AppProvider";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  </React.StrictMode>
);

// Drop the HTML splash after first paint so React's Loader can take over (or the app).
requestAnimationFrame(() => {
  document.getElementById("ccst-boot-splash")?.remove();
});
