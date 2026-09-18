import {
  createContext,
  useCallback,
  useContext,
  useOptimistic,
  useTransition,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

type GoFn = (to: string) => void;

const OptimisticNavContext = createContext<{
  path: string;
  go: GoFn;
  isPending: boolean;
} | null>(null);

/** Shared optimistic path + transition nav for sidebar and dashboard links. */
export function OptimisticNavProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isPending, startTransition] = useTransition();
  const [optimisticPath, setOptimisticPath] = useOptimistic(location.pathname);

  const go = useCallback(
    (to: string) => {
      const pathOnly = to.split("?")[0] || to;
      // Do not wrap in document.startViewTransition — it snapshots the DOM and
      // races React's removeChild during route unmount (NotFoundError).
      startTransition(() => {
        setOptimisticPath(pathOnly);
        navigate(to);
      });
    },
    [navigate, setOptimisticPath, startTransition]
  );

  return (
    <OptimisticNavContext.Provider
      value={{ path: optimisticPath, go, isPending }}
    >
      {children}
    </OptimisticNavContext.Provider>
  );
}

export function useOptimisticNav() {
  const ctx = useContext(OptimisticNavContext);
  if (!ctx) {
    throw new Error("useOptimisticNav requires OptimisticNavProvider");
  }
  return ctx;
}
