import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuthStore } from "@/store/auth/authStore";
import { downloadMyKpiPdfApi } from "./kpi.api";

export const useKpiPdf = () => {
  const username = useAuthStore((s) => s.user?.username);

  return useMutation({
    mutationFn: () => downloadMyKpiPdfApi(username),
    onSuccess: () => {
      toast.success("KPI PDF downloaded.");
    },
    onError: (error: unknown) => {
      toast.error((error as Error)?.message || "Could not download the KPI PDF.");
    },
  });
};
