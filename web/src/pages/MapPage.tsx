import { lazy, Suspense, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import MapLab from "@/lab-map/MapLab";
import { SkeletonBlock } from "@/components/common/Skeleton";

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
      <Suspense fallback={<div className="map-lab">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "24px 32px", maxWidth: 640 }}>
          <SkeletonBlock width="100%" height="24px" radius="4px" />
          <SkeletonBlock width="100%" height="24px" radius="4px" />
          <SkeletonBlock width="60%" height="24px" radius="4px" />
        </div>
      </div>}>
        <ClassicMapMount />
      </Suspense>
    );
  }
  return <MapLab />;
}
