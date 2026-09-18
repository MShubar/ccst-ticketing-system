import { useEffect, useRef, useState } from "react";

import {
  fetchMapPresence,
  leaveMapPresence,
  touchMapPresence,
} from "@/services/queries/map";
import type { MapPresencePeer } from "@/types/map";

const POLL_MS = 2000;

function mapSvgCursorPoint(svg: SVGSVGElement, evt: MouseEvent) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const local = pt.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

export function mapPresenceColor(userId: string): string {
  let h = 0;
  const s = String(userId || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hues = [168, 24, 210, 42, 320, 195, 8, 255, 280, 130];
  return `hsl(${hues[h % hues.length]} 62% 46%)`;
}

type UseMapPresenceOpts = {
  svgRef: React.RefObject<SVGSVGElement | null>;
  enabled: boolean;
  onMapStamp?: (stamp: string, rev: number | null | undefined) => void;
};

export function useMapPresence({ svgRef, enabled, onMapStamp }: UseMapPresenceOpts) {
  const [peers, setPeers] = useState<MapPresencePeer[]>([]);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const dirtyPos = useRef(false);
  const lastMapRev = useRef<number | null | undefined>(null);
  const onMapStampRef = useRef(onMapStamp);
  onMapStampRef.current = onMapStamp;

  useEffect(() => {
    if (!enabled) return;
    const svg = svgRef.current;
    if (!svg) return;

    let stopped = false;
    let inFlight = false;
    let queued = false;

    const onMove = (evt: MouseEvent) => {
      const pt = mapSvgCursorPoint(svg, evt);
      if (!pt) return;
      lastPos.current = pt;
      dirtyPos.current = true;
    };

    const sync = async () => {
      if (stopped) return;
      if (inFlight) {
        queued = true;
        return;
      }
      inFlight = true;
      try {
        const shouldPost = dirtyPos.current && lastPos.current;
        dirtyPos.current = false;
        const data = shouldPost
          ? await touchMapPresence(lastPos.current!.x, lastPos.current!.y)
          : await fetchMapPresence();
        if (stopped) return;
        setPeers(data.peers || []);
        const rev = data.mapRev;
        const stamp = data.mapUpdatedAt;
        if (stamp && rev !== lastMapRev.current) {
          lastMapRev.current = rev;
          onMapStampRef.current?.(stamp, rev);
        }
      } catch {
        /* session gone */
      } finally {
        inFlight = false;
        if (queued && !stopped) {
          queued = false;
          void sync();
        }
      }
    };

    const goodbye = () => {
      if (stopped) return;
      stopped = true;
      svg.removeEventListener("mousemove", onMove);
      void leaveMapPresence();
    };

    svg.addEventListener("mousemove", onMove);
    const timer = window.setInterval(() => void sync(), POLL_MS);
    void sync();
    window.addEventListener("pagehide", goodbye);

    return () => {
      window.removeEventListener("pagehide", goodbye);
      window.clearInterval(timer);
      goodbye();
    };
  }, [enabled, svgRef]);

  return peers;
}
