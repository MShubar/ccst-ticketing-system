export type MapDeviceKindInput =
  | string
  | { type?: string; id?: string; zone?: string };

export function mapDeviceKind(nodeOrType: MapDeviceKindInput) {
  if (!nodeOrType || typeof nodeOrType === "string") {
    return { type: nodeOrType || "pc", cloudVm: false };
  }
  const type = nodeOrType.type || "pc";
  const id = String(nodeOrType.id || "");
  const zone = String(nodeOrType.zone || "");
  const cloudVm =
    type === "server" &&
    (zone === "cloud" ||
      /^CLOUD-VM-/i.test(id) ||
      id === "Safqa" ||
      id === "Keratin-Glow");
  return { type, cloudVm };
}

export function mapDeviceClass(nodeOrType: MapDeviceKindInput): string {
  const { type, cloudVm } = mapDeviceKind(nodeOrType);
  if (cloudVm) return "map-cloud-vm";
  if (type === "router") return "map-router";
  if (type === "switch") return "map-switch";
  if (type === "server") return "map-server";
  if (type === "printer") return "map-printer";
  if (type === "cloud") return "map-cloud";
  if (type === "ap") return "map-ap";
  if (type === "laptop") return "map-laptop";
  return "map-pc";
}

export function mapTextRows(height: number) {
  const mid = height / 2;
  return { label: mid - 2, meta: mid + 14 };
}

export function mapDeviceIcon(nodeOrType: MapDeviceKindInput): string {
  const { type, cloudVm } = mapDeviceKind(nodeOrType);

  if (type === "router") {
    return `<g class="map-glyph map-glyph-router">
      <rect class="map-icon-fill" x="11" y="24" width="30" height="14" rx="3"/>
      <rect class="map-icon-port" x="15" y="29" width="5" height="5" rx="0.7"/>
      <rect class="map-icon-port" x="23" y="29" width="5" height="5" rx="0.7"/>
      <rect class="map-icon-port" x="31" y="29" width="5" height="5" rx="0.7"/>
      <path class="map-icon-antenna" d="M17 24 V10 M17 10 l-4 5 M17 10 l4 5"/>
      <path class="map-icon-antenna" d="M35 24 V10 M35 10 l-4 5 M35 10 l4 5"/>
      <circle class="map-icon-led is-on" cx="37" cy="27" r="1.5"/>
      <circle class="map-icon-led" cx="14" cy="27" r="1.3"/>
    </g>`;
  }

  if (type === "switch") {
    return `<g class="map-glyph map-glyph-switch">
      <rect class="map-icon-fill" x="9" y="18" width="34" height="20" rx="2.5"/>
      <path class="map-icon-line" d="M11 22.5 H41"/>
      ${[13, 17, 21, 25, 29, 33, 37]
        .map(
          (x) =>
            `<rect class="map-icon-port" x="${x - 1.5}" y="25" width="3" height="9" rx="0.45"/>`
        )
        .join("")}
      <circle class="map-icon-led is-on" cx="13" cy="21" r="1.25"/>
      <circle class="map-icon-led is-on" cx="17.5" cy="21" r="1.25"/>
      <circle class="map-icon-led is-on" cx="22" cy="21" r="1.25"/>
      <circle class="map-icon-led" cx="26.5" cy="21" r="1.25"/>
    </g>`;
  }

  if (cloudVm) {
    return `<g class="map-glyph map-glyph-cloud-vm">
      <path class="map-icon-cloud" d="M13 38c-5 0-9-2.8-9-6.8 0-3 2.2-5.6 5.2-6.5 0.7-3.8 4.2-6.7 8.4-6.7 4.5 0 8.2 3 8.9 7.1 3.2 0.2 5.5 2.6 5.5 5.6 0 3.7-3.1 7.3-9 7.3z"/>
      <rect class="map-icon-fill" x="19" y="20" width="22" height="16" rx="2.2"/>
      <path class="map-icon-line" d="M22 25 H38 M22 30 H35"/>
      <rect class="map-icon-port" x="22" y="32.5" width="6" height="2.2" rx="0.4"/>
      <circle class="map-icon-led is-on" cx="37" cy="33.5" r="1.3"/>
    </g>`;
  }

  if (type === "server") {
    return `<g class="map-glyph map-glyph-server">
      <rect class="map-icon-fill" x="12" y="14" width="28" height="11" rx="1.6"/>
      <rect class="map-icon-fill" x="12" y="27" width="28" height="11" rx="1.6"/>
      <rect class="map-icon-port" x="15" y="16.5" width="10" height="6" rx="0.7"/>
      <rect class="map-icon-port" x="15" y="29.5" width="10" height="6" rx="0.7"/>
      <circle class="map-icon-led is-on" cx="34" cy="19.5" r="1.4"/>
      <circle class="map-icon-led is-on" cx="34" cy="32.5" r="1.4"/>
      <path class="map-icon-line" d="M12 25.5 H40"/>
    </g>`;
  }

  if (type === "printer") {
    return `<g class="map-glyph map-glyph-printer">
      <rect class="map-icon-paper" x="17" y="12" width="18" height="7" rx="1"/>
      <path class="map-icon-fill" d="M13 21 h26 a3.2 3.2 0 0 1 3.2 3.2 v11 a2.2 2.2 0 0 1-2.2 2.2 H12 a2.2 2.2 0 0 1-2.2-2.2 V24.2 A3.2 3.2 0 0 1 13 21z"/>
      <rect class="map-icon-screen" x="19" y="24" width="14" height="6" rx="1"/>
      <rect class="map-icon-port" x="15" y="34" width="22" height="5.5" rx="1.1"/>
      <circle class="map-icon-led is-on" cx="35" cy="27" r="1.4"/>
    </g>`;
  }

  if (type === "cloud") {
    return `<g class="map-glyph map-glyph-cloud">
      <path class="map-icon-cloud" d="M16 36c-5.5 0-10-3.2-10-7.5 0-3.6 2.8-6.6 6.5-7.2 1.2-4.6 5.6-7.8 10.6-7.8 5.5 0 10.1 3.6 11 8.5 3.6 0.4 6.4 3.2 6.4 6.6 0 4.2-3.6 7.4-9.5 7.4z"/>
    </g>`;
  }

  if (type === "ap") {
    return `<g class="map-glyph map-glyph-ap">
      <rect class="map-icon-fill" x="14" y="28" width="24" height="9" rx="4.5"/>
      <circle class="map-icon-led is-on" cx="26" cy="32.5" r="1.6"/>
      <path class="map-icon-wave" d="M20 24a8 8 0 0 1 12 0"/>
      <path class="map-icon-wave" d="M16 19a14 14 0 0 1 20 0"/>
    </g>`;
  }

  if (type === "laptop") {
    return `<g class="map-glyph map-glyph-laptop">
      <rect class="map-icon-fill" x="15" y="16" width="22" height="15" rx="1.5"/>
      <rect class="map-icon-screen" x="17" y="18" width="18" height="11" rx="1"/>
      <path class="map-icon-fill" d="M12 33 h28 l-3 5 H15 z"/>
      <path class="map-icon-line" d="M22 35.5 H30"/>
    </g>`;
  }

  return `<g class="map-glyph map-glyph-pc">
    <rect class="map-icon-fill" x="13" y="12" width="26" height="19" rx="2.2"/>
    <rect class="map-icon-screen" x="15.5" y="14.2" width="21" height="13" rx="1.2"/>
    <rect class="map-icon-fill" x="23" y="31" width="6" height="3.2" rx="0.6"/>
    <rect class="map-icon-fill" x="15" y="34.5" width="22" height="4.5" rx="1.1"/>
    <path class="map-icon-line" d="M18 36.8 H34"/>
  </g>`;
}
