import type { ReactNode } from "react";

import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { queryClient } from "@/services/queryClient";
import AppErrorBoundary from "@/components/common/AppErrorBoundary";
import AuthInitializer from "@/components/common/AuthInitializer";
import { ThemeProvider } from "@/theme";
import { colors } from "@/theme/colors";

type AppProviderProps = {
  children: ReactNode;
};

export default function AppProvider({ children }: AppProviderProps) {
  return (
    <ThemeProvider>
      <AppErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthInitializer>{children}</AuthInitializer>
          <Toaster
            position="top-right"
            closeButton
            toastOptions={{
              style: {
                background: colors.card,
                border: `1px solid ${colors.line}`,
                color: colors.ink,
              },
            }}
          />
        </QueryClientProvider>
      </AppErrorBoundary>
    </ThemeProvider>
  );
}
