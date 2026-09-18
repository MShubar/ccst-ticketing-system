import { colors } from "./colors";
import { fonts } from "./fonts";

export const theme = {
  colors,
  fonts,
  radii: {
    sm: "8px",
    md: "10px",
    lg: "12px",
    xl: "14px",
    xxl: "16px",
  },
  space: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    xxl: "28px",
  },
} as const;

export type AppTheme = typeof theme;

export default theme;
