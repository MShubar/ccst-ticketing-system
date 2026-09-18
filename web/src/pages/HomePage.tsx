import { Navigate } from "react-router-dom";
import { ROUTES } from "@/constants/routes";

/** Template HomePage → CCST dashboard. */
export default function HomePage() {
  return <Navigate to={ROUTES.DASHBOARD} replace />;
}
