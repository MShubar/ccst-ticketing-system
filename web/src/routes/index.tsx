import { createBrowserRouter, Navigate, Outlet, useRouteError, isRouteErrorResponse } from "react-router-dom";
import React from "react";

import { ROUTES } from "@/constants/routes";
import MainLayout from "@/layouts/MainLayout";
import { OptimisticNavProvider } from "@/nav/OptimisticNavContext";
import ProtectedRoute from "@/routes/ProtectedRoute";
import Loader from "@/components/common/Loader";

const DashboardPage = React.lazy(() => import("@/pages/DashboardPage"));
const HomePage = React.lazy(() => import("@/pages/HomePage"));
const KnowledgeBasePage = React.lazy(() => import("@/pages/KnowledgeBasePage"));
const LoginPage = React.lazy(() => import("@/pages/LoginPage"));
const MapPage = React.lazy(() => import("@/pages/MapPage"));
const NewTicketPage = React.lazy(() => import("@/pages/NewTicketPage"));
const NotFoundPage = React.lazy(() => import("@/pages/NotFoundPage"));
const PortalsPage = React.lazy(() => import("@/pages/PortalsPage"));
const ProgressPage = React.lazy(() => import("@/pages/ProgressPage"));
const TeamPage = React.lazy(() => import("@/pages/TeamPage"));
const TicketDetailPage = React.lazy(() => import("@/pages/TicketDetailPage"));
const TicketsPage = React.lazy(() => import("@/pages/TicketsPage"));

function RouteErrorPage() {
  const err = useRouteError();
  const isRouteErr = isRouteErrorResponse(err);
  const message = isRouteErr
    ? err.statusText || String(err.status)
    : err instanceof Error
      ? err.message
      : "Something went wrong";

  // Stale-chunk failure during a deploy transition: the browser or an old
  // service worker cached an older index-DRraYYkZ.js that references chunk
  // hashes no longer on the server. The SPA fallback serves index.html as
  // text/html for the missing JS path, which the module loader rejects.
  // Recovery: hard-refresh (busts the stale cache) or fall back to the
  // classic UI which is always deployed and doesn't use these chunks.
  const isStaleChunkError =
    typeof message === "string" &&
    message.startsWith("Failed to fetch dynamically imported module");

  return (
    <div style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>
        {isStaleChunkError ? "App updated — please refresh" : "Something went wrong"}
      </h1>
      <p style={{ color: "#5a6b7a", margin: "0 0 16px" }}>
        {isStaleChunkError ? (
          <>
            The app was recently updated and your browser is holding onto an
            older version.{" "}
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                background: "none",
                border: "1px solid #1aa89a",
                color: "#1aa89a",
                padding: "4px 12px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: "inherit",
                fontFamily: "inherit",
              }}
            >
              Refresh now
            </button>{" "}
            or use the{" "}
            <a
              href="/classic/"
              style={{ color: "#1aa89a" }}
            >
              classic interface
            </a>{" "}
            in the meantime.
          </>
        ) : (
          message
        )}
      </p>
      {!isStaleChunkError && (
        <button
          type="button"
          onClick={() => window.location.assign("/dashboard")}
          style={{
            background: "none",
            border: "1px solid #1aa89a",
            color: "#1aa89a",
            padding: "4px 12px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: "inherit",
            fontFamily: "inherit",
          }}
        >
          Back to dashboard
        </button>
      )}
    </div>
  );
}

export const router = createBrowserRouter([
  {
    element: <Outlet />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: ROUTES.LOGIN, element: <React.Suspense fallback={<Loader />}><LoginPage /></React.Suspense> },
    ],
  },
  {
    element: (
      <ProtectedRoute>
        <OptimisticNavProvider>
          <MainLayout />
        </OptimisticNavProvider>
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      { path: ROUTES.HOME, element: <React.Suspense fallback={<Loader />}><HomePage /></React.Suspense> },
      { path: ROUTES.DASHBOARD, element: <React.Suspense fallback={<Loader />}><DashboardPage /></React.Suspense> },
      { path: ROUTES.PROGRESS, element: <React.Suspense fallback={<Loader />}><ProgressPage /></React.Suspense> },
      { path: ROUTES.TICKETS, element: <React.Suspense fallback={<Loader />}><TicketsPage /></React.Suspense> },
      { path: ROUTES.TICKETS_NEW, element: <React.Suspense fallback={<Loader />}><NewTicketPage /></React.Suspense> },
      { path: `${ROUTES.TICKETS}/:id`, element: <React.Suspense fallback={<Loader />}><TicketDetailPage /></React.Suspense> },
      { path: ROUTES.PORTALS, element: <React.Suspense fallback={<Loader />}><PortalsPage /></React.Suspense> },
      { path: `${ROUTES.PORTALS}/:which`, element: <React.Suspense fallback={<Loader />}><PortalsPage /></React.Suspense> },
      { path: ROUTES.TEAM, element: <React.Suspense fallback={<Loader />}><TeamPage /></React.Suspense> },
      { path: ROUTES.KB, element: <React.Suspense fallback={<Loader />}><KnowledgeBasePage /></React.Suspense> },
      { path: ROUTES.MAP, element: <React.Suspense fallback={<Loader />}><MapPage /></React.Suspense> },
    ],
  },
  {
    path: "/admin",
    element: <Navigate to={ROUTES.DASHBOARD} replace />,
  },
  {
    path: ROUTES.NOT_FOUND,
    element: <NotFoundPage />,
  },
]);
