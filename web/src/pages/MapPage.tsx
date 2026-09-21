import { lazy, Suspense, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/auth/authStore";

import MapLab from "@/lab-map/MapLab";
import { SkeletonBlock } from "@/components/common/Skeleton";
import { Card, Hint } from "@/components/ui/primitives";

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
  const user = useAuthStore((s: any) => s.user);
  const canUseMap = user?.level >= 7;

  if (classic) {
    return canUseMap ? (
      <Suspense fallback={<div className="map-lab">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "24px 32px", maxWidth: 640 }}>
          <SkeletonBlock width="100%" height="24px" radius="4px" />
          <SkeletonBlock width="100%" height="24px" radius="4px" />
          <SkeletonBlock width="60%" height="24px" radius="4px" />
        </div>
      </div>}>
        <ClassicMapMount />
      </Suspense>
    ) : (
      <div className="map-lab">
        <Card style={{ maxWidth: 560, margin: "40px auto" }}>
          <h3>Lab map locked</h3>
          <Hint>Reach Level 7 to unlock the lab map. You're currently at Level {user?.level || 1}.</Hint>
        </Card>
      </div>
    );
  }
  return (
    <div className="map-lab">
      {canUseMap ? (
        <MapLab />
      ) : (
        <Card style={{ maxWidth: 560, margin: "40px auto" }}>
          <h3>Lab map locked</h3>
          <Hint>Reach Level 7 to unlock the lab map. You're currently at Level {user?.level || 1}.</Hint>
        </Card>
      )}
    </div>
  );
}
