/**
 * Shared color tokens for the React shell.
 * Import these (or `theme.colors`) in styled-components — do not hardcode hex elsewhere.
 */
export const colors = {
  navy: "#07131f",
  navy2: "#0d1f30",
  navy3: "#163047",
  ink: "#17202a",
  muted: "#5b6b78",
  line: "#d9d1c3",
  paper: "#f3eee4",
  paper2: "#faf7f1",
  card: "#fffcf7",
  teal: "#1aa89a",
  tealDeep: "#0e7c72",
  amber: "#c9842a",
  coral: "#c44b3c",
  plum: "#6b4c7a",
  ok: "#2f7d4a",
  white: "#ffffff",
  classicEmbed: "#0b1c28",
  sidebarText: "#e8efe9",
  sidebarMuted: "#9bb0b8",
  navLink: "#d5e0e4",
  loginCopy: "#e7eeea",
  warningBg: "#fff5e0",
  warningBorder: "#d98b00",
  warningText: "#6b4400",
  announceBgFrom: "#e8f4f1",
  announceBgTo: "#eef6fb",
  announceBorder: "#b7d4ce",
  announceText: "#163047",
  shadow: "0 18px 40px rgba(7, 19, 31, 0.08)",
  overlay: "rgba(7, 19, 31, 0.45)",
  cardWash: "linear-gradient(165deg, rgba(255, 252, 247, 0.98), rgba(243, 238, 228, 0.55))",
  track: "rgba(217, 209, 195, 0.55)",
  tealGlow: "rgba(26, 168, 154, 0.18)",
  tealGlowStrong: "rgba(26, 168, 154, 0.25)",
  tealSoft: "rgba(26, 168, 154, 0.1)",
  tealBorder: "rgba(26, 168, 154, 0.45)",
  tealRing: "rgba(26, 168, 154, 0.22)",
  coralSoft: "rgba(196, 75, 60, 0.08)",
  whiteSoft: "rgba(255, 255, 255, 0.07)",
  priority: {
    critical: "#c44b3c",
    high: "#c9842a",
    medium: "#3d7ea6",
    low: "#2f7d4a",
    unassigned: "#8a97a3",
  },
  status: {
    new: "#1aa89a",
    inProgress: "#3d7ea6",
    pending: "#c9842a",
    escalated: "#c44b3c",
  },
} as const;

export type Colors = typeof colors;

export default colors;
