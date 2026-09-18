import styled, { keyframes } from "styled-components";

import { colors } from "@/theme/colors";

type LoaderProps = {
  variant?: "screen" | "inline" | "compact";
  /** Kept for call-site compatibility; unused. */
  text?: string;
};

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Boot = styled.div<{ $variant: "screen" | "inline" | "compact" }>`
  position: relative;
  display: grid;
  place-items: center;
  isolation: isolate;
  overflow: hidden;
  contain: layout paint style;
  background: ${colors.navy};
  pointer-events: none;

  ${({ $variant }) =>
    $variant === "screen" &&
    `
      position: fixed;
      inset: 0;
      z-index: 9999;
      min-height: 100dvh;
    `}

  ${({ $variant, theme }) =>
    ($variant === "inline" || $variant === "compact") &&
    `
      min-height: ${$variant === "compact" ? "120px" : "240px"};
      width: 100%;
      border-radius: ${theme.radii.xl};
      background: ${colors.navy2};
    `}
`;

const Spinner = styled.div<{ $compact?: boolean }>`
  width: ${({ $compact }) => ($compact ? "28px" : "36px")};
  height: ${({ $compact }) => ($compact ? "28px" : "36px")};
  border-radius: 50%;
  border: ${({ $compact }) => ($compact ? "2.5px" : "3px")} solid
    ${colors.tealRing};
  border-top-color: ${colors.teal};
  animation: ${spin} 0.7s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    opacity: 0.85;
  }
`;

export default function Loader({ variant = "screen" }: LoaderProps) {
  return (
    <Boot
      $variant={variant}
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <Spinner $compact={variant === "compact"} aria-hidden="true" />
    </Boot>
  );
}
