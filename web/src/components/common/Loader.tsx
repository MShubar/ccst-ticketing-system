import styled, { keyframes } from "styled-components";

import { BrandKicker, Hint } from "@/components/ui/primitives";
import { SkeletonCard } from "@/components/common/Skeleton";
import { colors } from "@/theme/colors";
import type { ReactNode } from "react";

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

/**
 * Variants:
 * - "screen": full-screen branded boot/pause overlay (used on app startup and
 *   when the route frame is empty between transitions).
 * - "inline": a compact spinner for tight spots (buttons, small cards).
 * - "card": a content placeholder — shimmer card + optional text.
 */
type LoaderVariant = "screen" | "inline" | "card";

type LoaderProps = {
  /** Visual treatment. */
  variant?: LoaderVariant;
  /** Optional caption beneath the spinner (screen/inline only). */
  caption?: string;
  /** Optional top kicker line (screen only). */
  kicker?: string;
  /** Children rendered inside the loader (card variant uses children as the
   *  shimmered content placeholder; other variants ignore children). */
  children?: ReactNode;
  /** When true, swap the spinner for a shimmer placeholder. */
  useSkeleton?: boolean;
};

const ScreenRoot = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  background: ${colors.navy};
  color: ${colors.loginCopy};
  overflow: hidden;
  isolation: isolate;
`;

const ScreenCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 36px 40px;
  background: rgba(12, 22, 33, 0.55);
  border: 1px solid ${colors.tealRing};
  border-radius: 18px;
  backdrop-filter: blur(4px);
  text-align: center;
  contain: layout style paint;
`;

const BrandRow = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
`;

const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.fonts.serif};
  font-size: 34px;
  line-height: 1;
  color: ${colors.teal};
  letter-spacing: -0.01em;
`;

const Caption = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${colors.loginCopy};
  opacity: 0.7;
`;

const Spinner = styled.div<{ $size?: number }>`
  width: ${({ $size = 34 }) => $size}px;
  height: ${({ $size = 34 }) => $size}px;
  border: 3px solid ${colors.tealRing};
  border-top-color: ${colors.teal};
  border-radius: 50%;
  animation: ${spin} 0.7s linear infinite;
  flex-shrink: 0;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    opacity: 0.85;
  }
`;

const InlineRoot = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px 10px;
  color: ${colors.muted};
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const CardRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export default function Loader({
  variant = "screen",
  caption,

  children,
  useSkeleton = false,
}: LoaderProps) {
  if (variant === "screen") {
    return (
      <ScreenRoot role="status" aria-busy="true" aria-label={caption ?? "Loading"}>
        <ScreenCard>
          <BrandRow>
            <BrandKicker>ProCloud Training Center</BrandKicker>
            <Title>CCST Ticketing</Title>
          </BrandRow>
          {useSkeleton ? (
            <SkeletonCard bodyRows={2} className="loader-skeleton" />
          ) : (
            <Spinner $size={34} aria-hidden="true" />
          )}
          {caption && <Caption>{caption}</Caption>}
        </ScreenCard>
      </ScreenRoot>
    );
  }

  if (variant === "inline") {
    return (
      <InlineRoot role="status" aria-busy="true" aria-label={caption ?? "Loading"}>
        <Spinner $size={14} aria-hidden="true" />
        {caption && <span>{caption}</span>}
      </InlineRoot>
    );
  }

  // variant === "card"
  return (
    <CardRoot role="status" aria-busy="true" aria-label={caption ?? "Loading"}>
      {useSkeleton ? (
        <SkeletonCard bodyRows={2} className="loader-skeleton" />
      ) : (
        children
      )}
      {caption && <Hint>{caption}</Hint>}
    </CardRoot>
  );
}
