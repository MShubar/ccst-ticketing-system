import { lazy, Suspense, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import MapLab from "@/lab-map/MapLab";

const ClassicMapMount = lazy(() => import("@/pages/ClassicMapMount"));

const CLASSIC_STORAGE_KEY = "ccst.map.engine";

function useClassicMapEngine(): boolean {
  const [params] = useSearchParams();
  const classicParam = params.get("classic") === "1";
  const classicStorage = useMemo(() => {
    try {
      return localStorage.getItem(CLASSIC_STORAGE_KEY) === "classic";
    } catch {
      return false;
    }
  }, []);
  return classicParam || classicStorage;
}

export default function MapPage() {
  const classic = useClassicMapEngine();
  if (classic) {
    return (
      <Suspense fallback={<div className="map-lab">Loading classic map…</div>}>
        <ClassicMapMount />
      </Suspense>
    );
  }
  return <MapLab />;
}
