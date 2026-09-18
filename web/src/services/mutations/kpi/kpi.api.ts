import { downloadFile } from "@/utils/downloadFile";

/** GET /api/kpis/pdf — the signed-in student's own KPI report. */
export const downloadMyKpiPdfApi = (username?: string | null) =>
  downloadFile("/kpis/pdf", `kpi-${username || "me"}.pdf`);
