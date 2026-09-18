import { type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useOptimisticNav } from "@/nav/OptimisticNavContext";

type Props = {
  to: string;
  /** Forwarded so `styled(OptimisticLink)` can inject styles. */
  className?: string;
  children: ReactNode;
};

/**
 * Navigates via the shared optimistic path so the title/nav highlight update
 * on the same click as the sidebar.
 */
export default function OptimisticLink({ to, className, children }: Props) {
  const { go } = useOptimisticNav();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }
    event.preventDefault();
    go(to);
  };

  return (
    <Link to={to} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
