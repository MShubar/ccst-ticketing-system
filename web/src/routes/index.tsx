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
  const message = isRouteErrorResponse(err)
    ? err.statusText || String(err.status)
    : err instanceof Error
      ? err.message
      : "Something went wrong";
  return (
    <div style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
      <p style={{ color: "#5a6b7a", margin: "0 0 16px" }}>{message}</p>
      <button type="button" onClick={() => window.location.assign("/dashboard")}>
        Back to dashboard
      </button>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    element: <Outlet />,
    errorElement: <RouteErrorPage />,
    children: [{ path: ROUTES.LOGIN, element: <LoginPage /> }],
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
