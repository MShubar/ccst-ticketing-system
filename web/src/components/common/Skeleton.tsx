import styled, { keyframes } from "styled-components";

import { colors } from "@/theme/colors";

/** Shimmer sweep for skeleton blocks. */
const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

interface SkeletonBaseProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
}

const shapeRadius = {
  rect: "8px",
  circle: "999px",
  line: "3px",
};

const SkeletonShapeEl = styled.div<SkeletonBaseProps>`
  background: linear-gradient(
    90deg,
    ${colors.navy2} 0%,
    ${colors.navy3} 45%,
    ${colors.navy2} 55%
  );
  background-size: 200% 100%;
  animation: ${shimmer} 1.6s ease-in-out infinite;
  flex-shrink: 0;

  ${({ width = "100%" }) =>
    width !== "auto" && `width: ${width};`}

  ${({ height }) =>
    height !== "auto" && `height: ${height};`}

  border-radius: ${({ borderRadius }) =>
    borderRadius ?? shapeRadius.rect};
`;

const SkeletonTextRow = styled.div<{ $count?: number; $gap?: string }>`
  display: flex;
  flex-direction: column;
  gap: ${({ $gap = "10px" }) => $gap};
  width: 100%;
`;

const SkeletonLine = styled(SkeletonShapeEl)<{ $last?: boolean }>`
  height: 12px;
  border-radius: 3px;
  width: ${({ $last }) => ($last ? "60%" : "100%")};
`;

const SkeletonCircle = styled(SkeletonShapeEl)<{ $size?: string }>`
  width: ${({ $size = "36px" }) => $size};
  height: ${({ $size = "36px" }) => $size};
  border-radius: 999px;
`;

const SkeletonRect = styled(SkeletonShapeEl)<{ $width?: string; $height?: string; $radius?: string }>`
  width: ${({ $width = "100%" }) => $width};
  height: ${({ $height = "120px" }) => $height};
  border-radius: ${({ $radius = "8px" }) => $radius};
`;

export interface SkeletonProps {
  /** Renders a shimmer rectangle (default), circle, or stack of text lines. */
  as?: "rect" | "circle" | "lines";
  /** Width of the skeleton element (default "100%"). */
  width?: string;
  /** For circle: size in CSS length (default 36px). */
  size?: string;
  /** For rect: explicit height (default 120px). */
  height?: string;
  /** For rect: explicit border radius (default 8px). */
  borderRadius?: string;
  /** For lines: number of lines to render (default 3). */
  count?: number;
  /** For lines: gap between lines (default "10px"). */
  gap?: string;
  className?: string;
}

export function Skeleton({
  as = "rect",
  width = "100%",
  height,
  borderRadius,
  size,
  count = 3,
  gap = "10px",
  className,
}: SkeletonProps) {
  if (as === "lines") {
    return (
      <SkeletonTextRow $count={count} $gap={gap} className={className}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonLine key={i} $last={i === count - 1} width={width} />
        ))}
      </SkeletonTextRow>
    );
  }

  if (as === "circle") {
    return (
      <SkeletonCircle
        $size={size}
        width={width}
        height={height ?? size ?? "36px"}
        borderRadius="999px"
        className={className}
      />
    );
  }

  return (
    <SkeletonRect
      $width={width}
      $height={height ?? "120px"}
      $radius={borderRadius ?? "8px"}
      className={className}
    />
  );
}

/** A compact card shell with a shimmer body. */
export function SkeletonCard({
  header = true,
  bodyRows = 3,
  className,
}: {
  header?: boolean;
  bodyRows?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        background: colors.card,
        border: `1px solid ${colors.line}`,
        borderRadius: "12px",
        padding: "16px 18px",
        width: "100%",
      }}
    >
      {header ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: header && bodyRows > 0 ? "14px" : 0,
          }}
        >
          <Skeleton as="circle" size="32px" />
          <SkeletonLine width="60%" />
        </div>
      ) : null}
      <SkeletonTextRow $count={bodyRows} $gap="10px">
        {Array.from({ length: bodyRows }).map((_, i) => (
          <SkeletonLine key={i} $last={i === bodyRows - 1} width="100%" />
        ))}
      </SkeletonTextRow>
    </div>
  );
}

/** Shimmer block for avatars, inputs, placeholders. */
export function SkeletonBlock({
  width = "100%",
  height = "120px",
  radius = "8px",
  className,
}: {
  width?: string;
  height?: string;
  radius?: string;
  className?: string;
}) {
  return (
    <SkeletonRect
      $width={width}
      $height={height}
      $radius={radius}
      className={className}
    />
  );
}

/** Shimmer text lines. */
export function SkeletonLines({
  count = 3,
  width = "100%",
  gap = "10px",
  className,
  style,
}: {
  count?: number;
  width?: string;
  gap?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <SkeletonTextRow $count={count} $gap={gap} className={className} style={style}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonLine key={i} $last={i === count - 1} width={width} />
      ))}
    </SkeletonTextRow>
  );
}

export { Skeleton as default };
