import type { ReactNode } from "react";
import { ThemeProvider as StyledThemeProvider } from "styled-components";

import { GlobalStyle } from "./GlobalStyle";
import { theme } from "./theme";

export default function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <StyledThemeProvider theme={theme}>
      <GlobalStyle />
      {children}
    </StyledThemeProvider>
  );
}
