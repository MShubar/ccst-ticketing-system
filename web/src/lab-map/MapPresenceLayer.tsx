import { mapPresenceColor } from "@/lab-map/useMapPresence";
import type { MapPresencePeer } from "@/types/map";

export default function MapPresenceLayer({ peers }: { peers: MapPresencePeer[] }) {
  return (
    <g id="map-presence-layer" className="map-presence" aria-hidden="true">
      {peers.map((p) => {
        const first = String(p.name || "Peer").trim().split(/\s+/)[0] || "Peer";
        const fill = mapPresenceColor(p.userId);
        const tagW = Math.max(28, first.length * 6.4 + 12);
        const role = p.role === "instructor" ? " · instructor" : "";
        const x = Number(p.x) || 0;
        const y = Number(p.y) || 0;
        return (
          <g
            key={p.userId}
            className="map-cursor"
            transform={`translate(${x} ${y})`}
            data-user={p.userId}
            data-name={first}
          >
            <path
              className="map-cursor-arrow"
              fill={fill}
              stroke="#0b1a24"
              strokeWidth={1.1}
              d="M0 0 L0 18 L5.5 14 L9.5 23 L13 21.5 L8.5 12.5 L15 12.5 Z"
            />
            <rect
              className="map-cursor-tag"
              x={16}
              y={-2}
              rx={3}
              height={15}
              width={tagW}
              fill={fill}
            />
            <text className="map-cursor-name" x={22} y={9}>
              {first}
            </text>
            <title>{`${p.name || ""}${role}`}</title>
          </g>
        );
      })}
    </g>
  );
}
