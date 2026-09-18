import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type PageReadyContextValue = {
  /** True once the first real page body has painted. */
  ready: boolean;
  markReady: () => void;
};

const PageReadyContext = createContext<PageReadyContextValue | null>(null);

/** Gates the outer boot screen until the first page has real content. */
export function PageReadyProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  const markReady = useCallback(() => {
    setReady(true);
  }, []);

  return (
    <PageReadyContext.Provider value={{ ready, markReady }}>
      {children}
    </PageReadyContext.Provider>
  );
}

export function usePageReady() {
  const ctx = useContext(PageReadyContext);
  if (!ctx) {
    throw new Error("usePageReady requires PageReadyProvider");
  }
  return ctx;
}
