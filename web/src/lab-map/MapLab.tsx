import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import DeviceConsole from "@/lab-map/DeviceConsole";
import { ensureMapCss } from "@/lab-map/ensureMapCss";
import {
  applyLocalLinkOp,
  cloneLabels,
  occupied,
  patchHostLabels,
} from "@/lab-map/linkOps";
import {
  mapDeviceClass,
  mapDeviceIcon,
  mapTextRows,
} from "@/lab-map/mapDevices";
import { getMapZoom, setMapZoom } from "@/lab-map/mapZoom";
import {
  computeAnchors,
  mapCorridorY,
  mapDeviceType,
  mapOrthogonalWaypoints,
  mapPickCable,
  mapPointsToRoundedPath,
  mapRadioHtml,
  mapWiresHtml,
} from "@/lab-map/mapWires.js";
import MapPresenceLayer from "@/lab-map/MapPresenceLayer";
import { useMapPresence } from "@/lab-map/useMapPresence";
import { usePageReady } from "@/nav/PageReadyContext";
import {
  fetchMapOmitTopology,
  fetchMapLabels,
  useLinkOpMutation,
  useMap,
  useResetDevicesMutation,
  useResetMapMutation,
} from "@/services/queries/map";
import type { MapLabel, MapLink, MapNode, MapPayload } from "@/types/map";
import { formatWhen } from "@/utils/format";
import { isInstructorRole } from "@/utils/ticketDisplay";
import { useAuthStore } from "@/store/auth/authStore";

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.15;
const SEARCH_MAX = 12;
const SEARCH_ZOOM = 0.45;

type SearchHit = {
  id: string;
  label: string;
  place: string;
  detail: string;
  rank: number;
};

function resetStatus(
  lastResetBy: MapPayload["lastResetBy"],
  lastResetAt: MapPayload["lastResetAt"],
  refaultedCount?: number | null,
  deviceCount?: number | null
): string | null {
  const who = lastResetBy?.fullName || lastResetBy?.username;
  const when = lastResetAt ? ` · ${formatWhen(lastResetAt)}` : "";
  const by = who ? ` by ${who}${when}` : "";
  if (refaultedCount == null) {
    return who ? `Last reset to the design${by}.` : null;
  }
  const left: string[] = [];
  if (refaultedCount) left.push(`${refaultedCount} cable(s) left unplugged`);
  if (deviceCount) left.push(`${deviceCount} device(s) left faulty`);
  return left.length
    ? `Reset to the design${by}; ${left.join(" and ")} for open tickets.`
    : `Cabling and device configs reset to the design${by}.`;
}

function mapSvgCursorPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(ctm.inverse());
}

export default function MapLab() {
  const [params] = useSearchParams();
  const fullscreen =
    params.get("fullscreen") === "1" || params.get("fullscreen") === "true";
  const { markReady } = usePageReady();
  const user = useAuthStore((s) => s.user);
  const instructor = isInstructorRole(user);

  const { data: mapData, isLoading, isError } = useMap();
  const linkOpMut = useLinkOpMutation();
  const resetMapMut = useResetMapMutation();
  const resetDevicesMut = useResetDevicesMutation();

  const [links, setLinks] = useState<MapLink[]>([]);
  const [labels, setLabels] = useState<Record<string, MapLabel>>({});
  const [wirelessLinks, setWirelessLinks] = useState<unknown[]>([]);
  const [mapVersion, setMapVersion] = useState<string | null>(null);
  const [lastResetBy, setLastResetBy] = useState<MapPayload["lastResetBy"]>(null);
  const [lastResetAt, setLastResetAt] = useState<MapPayload["lastResetAt"]>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState(
    "Click a free port, then another port, to plug a cable — it syncs live for the class. Click a cable to unplug it."
  );
  const [zoom, setZoomState] = useState(() =>
    getMapZoom() != null ? getMapZoom()! : fullscreen ? 1 : 0.85
  );
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(() => new Set());
  const [consoleDeviceId, setConsoleDeviceId] = useState<string | null>(null);
  const [foundDeviceId, setFoundDeviceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchCursor, setSearchCursor] = useState(-1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const wiresLayerRef = useRef<SVGGElement>(null);
  const opChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const pullingMapRef = useRef(false);

  const topo = mapData?.topology;
  const vb = topo?.viewBox || "0 0 1900 1780";
  const baseSvgW = Number(vb.split(/\s+/)[2]) || 1900;

  useEffect(() => {
    ensureMapCss();
    return () => setConsoleDeviceId(null);
  }, []);

  useEffect(() => {
    if (!mapData || !topo) return;
    setLinks(Array.isArray(mapData.links) ? [...mapData.links] : []);
    setLabels(mapData.labels || {});
    setWirelessLinks(Array.isArray(mapData.wireless) ? mapData.wireless : []);
    setMapVersion(mapData.updatedAt || null);
    setLastResetBy(mapData.lastResetBy || null);
    setLastResetAt(mapData.lastResetAt || null);
    // Only seed the reset hint once — later map refreshes must not clobber plug/unplug status.
    if (!initialized) {
      const rs = resetStatus(mapData.lastResetBy, mapData.lastResetAt);
      if (rs) setStatus(rs);
    }
    setInitialized(true);
  }, [mapData, topo, initialized]);

  useEffect(() => {
    if (initialized && !isLoading) markReady();
  }, [initialized, isLoading, markReady]);

  useEffect(() => {
    if (isError) markReady();
  }, [isError, markReady]);

  const anchors = useMemo(
    () => (topo ? computeAnchors(topo) : new Map()),
    [topo]
  );

  const usedKeys = useMemo(() => occupied(links), [links]);

  const wiresHtml = useMemo(() => {
    if (!topo) return "";
    return mapWiresHtml(topo, links, anchors);
  }, [topo, links, anchors]);

  const radioHtml = useMemo(
    () => mapRadioHtml(wirelessLinks, anchors),
    [wirelessLinks, anchors]
  );

  useEffect(() => {
    const layer = wiresLayerRef.current;
    if (!layer) return;
    layer.querySelectorAll(".map-bundle").forEach((el) => {
      const key = el.getAttribute("data-bundle");
      if (key) el.classList.toggle("is-expanded", expandedBundles.has(key));
    });
  }, [wiresHtml, expandedBundles]);

  const pullLinksIfNewer = useCallback(
    async (stamp: string) => {
      if (!stamp || stamp === mapVersion || pullingMapRef.current || pending) return;
      pullingMapRef.current = true;
      try {
        const { api } = await import("@/api/client");
        const { data } = await api.get<{ links: MapLink[]; updatedAt?: string }>("/map/links");
        if (pending) return;
        setLinks(Array.isArray(data.links) ? data.links : links);
        setMapVersion(data.updatedAt || mapVersion);
      } catch {
        /* retry on next tick */
      } finally {
        pullingMapRef.current = false;
      }
    },
    [mapVersion, pending, links]
  );

  const peers = useMapPresence({
    svgRef,
    enabled: Boolean(topo && initialized),
    onMapStamp: (stamp) => void pullLinksIfNewer(stamp),
  });

  const refreshLabels = useCallback(async () => {
    try {
      const res = await fetchMapLabels();
      setLabels(res.labels || labels);
      if (Array.isArray(res.wireless)) setWirelessLinks(res.wireless);
    } catch {
      /* ignore */
    }
  }, [labels]);

  const applyZoom = useCallback(
    (next: number, pivot?: { clientX: number; clientY: number }) => {
      const scroller = scrollRef.current;
      const clamped =
        Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) * 100) / 100;
      const prev = zoom;
      setZoomState(clamped);
      setMapZoom(clamped);
      if (scroller && prev > 0 && Number.isFinite(prev)) {
        const ratio = clamped / prev;
        if (pivot) {
          const rect = scroller.getBoundingClientRect();
          const px = pivot.clientX - rect.left;
          const py = pivot.clientY - rect.top;
          scroller.scrollLeft = (scroller.scrollLeft + px) * ratio - px;
          scroller.scrollTop = (scroller.scrollTop + py) * ratio - py;
        } else {
          const cx = scroller.clientWidth / 2;
          const cy = scroller.clientHeight / 2;
          scroller.scrollLeft = (scroller.scrollLeft + cx) * ratio - cx;
          scroller.scrollTop = (scroller.scrollTop + cy) * ratio - cy;
        }
      }
    },
    [zoom]
  );

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !initialized || getMapZoom() != null) return;
    const fit = (scroller.clientWidth - 6) / baseSvgW;
    if (fit > 0) applyZoom(Math.min(1, fit));
  }, [initialized, baseSvgW, applyZoom]);

  const applyLinkOp = useCallback(
    (body: { action: string; id?: string; a?: string; b?: string; cable?: string }) => {
      if (!topo) return Promise.reject(new Error("Map not loaded"));
      opChainRef.current = opChainRef.current.then(async () => {
        const prevLinks = links.slice();
        const prevLabels = cloneLabels(labels);
        const local = applyLocalLinkOp(body, links, topo);
        if (!local.ok) throw new Error(local.error || "Could not update that cable.");
        const nextLinks = local.links;
        setLinks(nextLinks);
        setLabels(patchHostLabels(labels, prevLinks, nextLinks, topo));
        try {
          const data = await linkOpMut.mutateAsync(body);
          setLinks(Array.isArray(data.links) ? data.links : nextLinks);
          setMapVersion(data.updatedAt || mapVersion);
          await refreshLabels();
          return data;
        } catch (err) {
          setLinks(prevLinks);
          setLabels(prevLabels);
          throw err;
        }
      });
      return opChainRef.current;
    },
    [topo, links, labels, linkOpMut, mapVersion, refreshLabels]
  );

  const handleWireLayerClick = (evt: React.MouseEvent) => {
    const target = evt.target as Element;
    const bundle = target.closest(".map-bundle") as SVGGElement | null;
    if (bundle && !target.closest(".map-bundle-expanded .map-wire-group")) {
      const key = bundle.getAttribute("data-bundle");
      if (key) {
        setExpandedBundles((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      }
      return;
    }
    const wire = target.closest(".map-wire-group[data-link]") as SVGGElement | null;
    if (!wire) return;
    evt.stopPropagation();
    const id = wire.getAttribute("data-link");
    if (!id) return;
    setStatus("Cable unplugged.");
    void applyLinkOp({ action: "unplug", id })
      .then(() => {
        setPending(null);
        setStatus("Cable unplugged — live for the class.");
      })
      .catch((err: Error) => {
        setStatus(err.message || "Could not unplug that cable.");
        toast.warning(err.message || "Could not unplug that cable.");
      });
  };

  const searchRow = (n: MapNode) => {
    const info = labels[n.id] || {};
    const detail = info.meta || n.ip || n.role || n.type;
    return {
      id: n.id,
      label: info.label || n.label || n.id,
      place: n.place || "",
      detail: String(detail || ""),
      type: n.type,
      hay: [n.id, n.label, n.place, n.role, n.ip, n.type, info.meta]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  };

  const runSearch = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q || !topo) {
      setSearchHits([]);
      setSearchCursor(-1);
      setSearchOpen(false);
      return;
    }
    const terms = q.split(/\s+/);
    const scored: SearchHit[] = [];
    for (const n of topo.nodes) {
      const row = searchRow(n);
      if (!terms.every((t) => row.hay.includes(t))) continue;
      const id = row.id.toLowerCase();
      const place = row.place.toLowerCase();
      let rank = 4;
      if (id === q) rank = 0;
      else if (id.startsWith(q)) rank = 1;
      else if (row.detail.toLowerCase().startsWith(q)) rank = 2;
      else if (place.startsWith(q)) rank = 3;
      scored.push({ ...row, rank });
      if (scored.length > 400) break;
    }
    scored.sort(
      (a, b) => a.rank - b.rank || a.id.localeCompare(b.id, undefined, { numeric: true })
    );
    const hits = scored.slice(0, SEARCH_MAX);
    setSearchHits(hits);
    setSearchCursor(hits.length ? 0 : -1);
    setSearchOpen(hits.length > 0);
  };

  const revealDevice = (id: string) => {
    const n = topo?.nodes.find((x) => x.id === id);
    if (!n) return;
    if (zoom < SEARCH_ZOOM) applyZoom(SEARCH_ZOOM);
    const scroller = scrollRef.current;
    if (scroller) {
      const cx = (n.x + (n.w || 112) / 2) * zoom;
      const cy = (n.y + (n.h || 58) / 2) * zoom;
      scroller.scrollTo({
        left: Math.max(0, cx - scroller.clientWidth / 2),
        top: Math.max(0, cy - scroller.clientHeight / 2),
        behavior: "smooth",
      });
    }
    setFoundDeviceId(id);
    window.setTimeout(() => setFoundDeviceId(null), 2600);
    const where = n.place ? ` · ${n.place}` : "";
    const opens =
      n.type === "router" || n.type === "switch" || n.type === "ap"
        ? "console"
        : "command prompt";
    setStatus(`Found ${id}${where}. Click it to open its ${opens}.`);
    setSearchOpen(false);
    setSearchHits([]);
  };

  const handlePortClick = async (key: string) => {
    const usedNow = occupied(links);
    if (usedNow.has(key) && pending !== key) {
      toast.warning(
        `${key} already has a cable — click a white (free) port, or click the cable to unplug.`
      );
      setStatus(
        pending
          ? `Still holding ${pending}. Click a free white port — teal means taken.`
          : "That port is taken (teal). Click a white free port, or click the cable to unplug it."
      );
      return;
    }
    if (!pending) {
      setPending(key);
      setStatus(`Selected ${key}. Click the other end — or empty map space to cancel.`);
      return;
    }
    if (pending === key) {
      setPending(null);
      setStatus("Selection cleared.");
      return;
    }
    if (usedNow.has(pending)) {
      toast.warning(`${pending} was taken meanwhile — pick a free port again.`);
      setPending(null);
      try {
        const fresh = await fetchMapOmitTopology();
        setLinks(Array.isArray(fresh.links) ? fresh.links : links);
        setMapVersion(fresh.updatedAt || mapVersion);
      } catch {
        /* keep local */
      }
      return;
    }
    const from = pending;
    const to = key;
    setPending(null);
    setStatus(`Cable plugged — live for the class.`);
    try {
      await applyLinkOp({
        action: "plug",
        a: from,
        b: to,
        cable: mapPickCable(mapDeviceType(topo!, from), mapDeviceType(topo!, to)),
      });
      setStatus("Cable plugged — live for the class.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not plug that cable.";
      const stillFree = !occupied(links).has(from);
      if (stillFree) {
        setPending(from);
        setStatus(`Still holding ${from}. That other port was taken — click a free white port.`);
      } else {
        setStatus("Plug failed — pick a free white port to try again.");
      }
      toast.warning(msg);
    }
  };

  const [ghostD, setGhostD] = useState("");

  const updateGhost = useCallback(
    (clientX: number, clientY: number) => {
      if (!pending || !svgRef.current || !topo) {
        setGhostD("");
        return;
      }
      const cursor = mapSvgCursorPoint(svgRef.current, clientX, clientY);
      if (!cursor) return;
      const start = anchors.get(pending);
      if (!start) return;
      const role = "access";
      const midY = mapCorridorY(start, cursor, role, topo);
      const pts = mapOrthogonalWaypoints(start, cursor, midY, 0, role);
      setGhostD(mapPointsToRoundedPath(pts));
    },
    [pending, anchors, topo]
  );

  if (isLoading && !initialized) {
    return (
      <div className="map-lab-react" style={{ opacity: 0.6 }}>
        <div className="map-toolbar card">
          <div className="map-search" id="map-search-box">
            <label className="map-search-label" htmlFor="map-search-skeleton">
              Find a device
            </label>
            <input
              id="map-search-skeleton"
              type="search"
              disabled
              placeholder="PC-S1, 10.10.20.10, Finance…"
              aria-label="Find a device on the map"
            />
          </div>
          <div className="map-zoom" role="group" aria-label="Zoom">
            <button className="btn secondary map-zoom-btn" type="button" disabled>−</button>
            <button className="btn secondary map-zoom-label" type="button" disabled>85%</button>
            <button className="btn secondary map-zoom-btn" type="button" disabled>+</button>
          </div>
          <div className="map-legend">
            <span><i className="lg-pc" /> PC</span>
            <span><i className="lg-laptop" /> Laptop</span>
            <span><i className="lg-printer" /> Printer</span>
            <span><i className="lg-switch" /> Switch</span>
            <span><i className="lg-router" /> Router</span>
            <span><i className="lg-server" /> Server / VM</span>
            <span><i className="lg-cloud-vm" /> Cloud VM</span>
            <span><i className="lg-ap" /> Access point</span>
          </div>
          <span className="hint" id="map-status">Loading lab map…</span>
        </div>
        <div className="map-board card" id="map-board">
          <div className="map-scroll" id="map-scroll" style={{ minHeight: 320 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", minHeight: 280, background: "var(--ccst-navy2, #0e1a28)", borderRadius: 8 }}>
              <div style={{ width: "100%", maxWidth: 1200, padding: "24px 32px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} style={{ height: 12, borderRadius: 3, width: i === 5 ? "60%" : "100%", background: "linear-gradient(90deg, #0e1a28 0%, #1a2c42 45%, #0e1a28 55%)", backgroundSize: "200% 100%", animation: "ccst-shimmer 1.6s ease-in-out infinite" }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="hint">Click a device for its console. Click two ports to plug a cable.</p>
      </div>
    );
  }
  if (!topo) {
    return <p className="hint">Could not load map topology.</p>;
  }

  return (
    <div className="map-lab-react">
      <div className="map-toolbar card">
        <div className="map-search" id="map-search-box">
          <label className="map-search-label" htmlFor="map-search">
            Find a device
          </label>
          <input
            id="map-search"
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="PC-S1, 10.10.20.10, Finance, printer…"
            aria-label="Find a device on the map"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              runSearch(e.target.value);
            }}
            onFocus={() => {
              if (searchQuery.trim()) runSearch(searchQuery);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchOpen(false);
                setSearchHits([]);
                return;
              }
              if (!searchHits.length) return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const step = e.key === "ArrowDown" ? 1 : -1;
                setSearchCursor(
                  (searchCursor + step + searchHits.length) % searchHits.length
                );
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                const hit = searchHits[searchCursor >= 0 ? searchCursor : 0];
                if (hit) revealDevice(hit.id);
              }
            }}
          />
          <ul
            className={`map-search-results ${searchOpen ? "is-open" : ""}`}
            id="map-search-results"
            role="listbox"
          >
            {searchHits.map((h, i) => (
              <li key={h.id}>
                <button
                  type="button"
                  className={`map-search-hit ${i === searchCursor ? "is-cursor" : ""}`}
                  data-hit={h.id}
                  onMouseEnter={() => setSearchCursor(i)}
                  onClick={() => revealDevice(h.id)}
                >
                  <span className="mh-name">
                    <i className={mapDeviceClass(h).replace("map-", "lg-")} />
                    {h.label}
                  </span>
                  <span className="mh-where">{h.place}</span>
                  <span className="mh-detail">{h.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {instructor ? (
          <button
            className="btn"
            type="button"
            id="map-reset"
            onClick={() => {
              if (
                !confirm(
                  "Reset this class to the designed cabling and device configuration?\n\n" +
                    "Cables named by open lab-map tickets stay unplugged, so those tickets are still solvable."
                )
              )
                return;
              void resetMapMut
                .mutateAsync()
                .then(async (res) => {
                  const dev = await resetDevicesMut.mutateAsync();
                  setLinks(res.links);
                  setMapVersion(res.updatedAt || mapVersion);
                  setLastResetBy(res.lastResetBy || lastResetBy);
                  setLastResetAt(res.lastResetAt || lastResetAt);
                  setPending(null);
                  setExpandedBundles(new Set());
                  setStatus(
                    resetStatus(
                      res.lastResetBy,
                      res.lastResetAt,
                      (res.refaulted || []).length,
                      (dev?.refaulted || []).length
                    ) || status
                  );
                  void refreshLabels();
                })
                .catch((err: Error) => setStatus(err.message));
            }}
          >
            Reset to design
          </button>
        ) : null}
        <div className="map-zoom" role="group" aria-label="Zoom">
          <button
            className="btn secondary map-zoom-btn"
            type="button"
            id="map-zoom-out"
            title="Zoom out"
            onClick={() => applyZoom(zoom - ZOOM_STEP)}
          >
            −
          </button>
          <button
            className="btn secondary map-zoom-label"
            type="button"
            id="map-zoom-label"
            title="Reset zoom"
            onClick={() => applyZoom(fullscreen ? 1 : 0.85)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="btn secondary map-zoom-btn"
            type="button"
            id="map-zoom-in"
            title="Zoom in"
            onClick={() => applyZoom(zoom + ZOOM_STEP)}
          >
            +
          </button>
        </div>
        {fullscreen ? (
          <>
            <button
              className="btn secondary"
              type="button"
              id="map-exit-full"
              onClick={() => {
                window.location.href = "/map";
              }}
            >
              Back to app
            </button>
            <button
              className="btn secondary"
              type="button"
              id="map-browser-full"
              onClick={async () => {
                try {
                  if (!document.fullscreenElement) {
                    await document.documentElement.requestFullscreen();
                  } else {
                    await document.exitFullscreen();
                  }
                } catch {
                  setStatus("Fullscreen was blocked by the browser.");
                }
              }}
            >
              Browser fullscreen
            </button>
          </>
        ) : (
          <button
            className="btn secondary"
            type="button"
            id="map-open-full"
            title="Open map in a new tab"
            onClick={() => {
              window.open(`${window.location.origin}/map?fullscreen=1`, "_blank", "noopener,noreferrer");
            }}
          >
            Open full screen
          </button>
        )}
        <div className="map-legend">
          <span><i className="lg-pc" /> PC</span>
          <span><i className="lg-laptop" /> Laptop</span>
          <span><i className="lg-printer" /> Printer</span>
          <span><i className="lg-switch" /> Switch</span>
          <span><i className="lg-router" /> Router</span>
          <span><i className="lg-server" /> Server / VM</span>
          <span><i className="lg-cloud-vm" /> Cloud VM</span>
          <span><i className="lg-ap" /> Access point</span>
        </div>
        <span className="hint" id="map-status">{status}</span>
      </div>

      <div
        className={`map-board card ${fullscreen ? "is-fullscreen" : ""}${pending ? " is-wiring" : ""}`}
        id="map-board"
      >
        <div
          className="map-scroll"
          id="map-scroll"
          tabIndex={0}
          ref={scrollRef}
          onWheel={(evt) => {
            if (!(evt.ctrlKey || evt.metaKey)) return;
            evt.preventDefault();
            const delta = evt.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
            applyZoom(zoom + delta, { clientX: evt.clientX, clientY: evt.clientY });
          }}
        >
          <svg
            className="lab-map"
            id="lab-map-svg"
            viewBox={vb}
            style={{ width: `${Math.round(baseSvgW * zoom)}px` }}
            role="img"
            aria-label="Lab network map"
            ref={svgRef}
            onMouseMove={(evt) => {
              if (pending) updateGhost(evt.clientX, evt.clientY);
            }}
            onClick={(evt) => {
              const t = evt.target as Element;
              if (
                pending &&
                !t.closest(".map-port, .map-device, .map-wire-group, .map-bundle, .map-cursor")
              ) {
                setPending(null);
                setStatus("Selection cleared. Click a free port to start a cable.");
                setGhostD("");
              }
            }}
          >
            <defs>
              <pattern id="map-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path
                  d="M 32 0 L 0 0 0 32"
                  fill="none"
                  stroke="rgba(22,48,71,0.04)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect
              className="map-canvas-bg"
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="url(#map-grid)"
            />
            <g className="map-zones">
              {(topo.zones || []).map((z) => (
                <g key={z.id} className={`map-zone map-zone-${z.tone || z.id}`}>
                  <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={18} />
                  <text className="map-zone-label" x={z.x + 18} y={z.y + 28}>
                    {z.label}
                  </text>
                </g>
              ))}
            </g>
            <g
              className="map-wires"
              ref={wiresLayerRef}
              dangerouslySetInnerHTML={{ __html: wiresHtml }}
              onClick={handleWireLayerClick}
            />
            <g className="map-radio" dangerouslySetInnerHTML={{ __html: radioHtml }} />
            <path
              id="map-ghost"
              className={`map-ghost ${pending ? "is-active" : ""}`}
              d={ghostD}
            />
            <g className="map-devices">
              {topo.nodes.map((n) => {
                const w = n.w || 108;
                const h = n.h || 56;
                const info = labels[n.id] || {};
                const fullLabel = info.label || n.label || n.id;
                const shortLabel =
                  fullLabel.length > 14 ? fullLabel.slice(0, 13) + "…" : fullLabel;
                const meta = info.meta || n.role || n.ip || n.type;
                const rows = mapTextRows(h);
                const consoleWord =
                  n.type === "router" || n.type === "switch" || n.type === "ap"
                    ? "console"
                    : "command prompt";
                const tooltip =
                  info.tooltip || `${fullLabel} — click to open the ${consoleWord}`;
                const ports = (n.ports || []).filter((p) => !/^Wlan/i.test(p.id));
                return (
                  <g key={n.id}>
                    <g
                      className={`map-device ${mapDeviceClass(n)}${info.alert ? " is-alert" : ""}${foundDeviceId === n.id ? " is-found" : ""}`}
                      data-device={n.id}
                      transform={`translate(${n.x},${n.y})`}
                      onClick={(evt) => {
                        evt.stopPropagation();
                        setConsoleDeviceId(n.id);
                      }}
                    >
                      <rect className="map-device-body" width={w} height={h} rx={12} />
                      <g
                        transform="translate(4,0)"
                        dangerouslySetInnerHTML={{ __html: mapDeviceIcon(n) }}
                      />
                      <text
                        className="map-label"
                        x={w / 2 + 10}
                        y={rows.label}
                        textAnchor="middle"
                      >
                        {shortLabel}
                      </text>
                      <text
                        className="map-meta"
                        x={w / 2 + 10}
                        y={rows.meta}
                        textAnchor="middle"
                      >
                        {meta}
                      </text>
                      <title>{tooltip}</title>
                    </g>
                    {ports.map((p) => {
                      const key = `${n.id}:${p.id}`;
                      const pt = anchors.get(key);
                      if (!pt) return null;
                      const busy = usedKeys.has(key);
                      const selected = pending === key;
                      return (
                        <g
                          key={key}
                          className={`map-port ${busy ? "is-busy" : "is-free"}${selected ? " is-selected" : ""}`}
                          data-endpoint={key}
                          transform={`translate(${pt.x},${pt.y})`}
                          onClick={(evt) => {
                            evt.preventDefault();
                            evt.stopPropagation();
                            void handlePortClick(key);
                          }}
                        >
                          <circle r={5.5} />
                          <title>{key}</title>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
            <MapPresenceLayer peers={peers} />
          </svg>
        </div>
        <p className="hint">Click a device for its console. Click two ports to plug a cable.</p>
      </div>

      {consoleDeviceId ? (
        <DeviceConsole
          deviceId={consoleDeviceId}
          onClose={() => {
            setConsoleDeviceId(null);
            void refreshLabels();
          }}
        />
      ) : null}
    </div>
  );
}
