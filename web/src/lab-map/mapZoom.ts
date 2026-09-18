/** Survives repaints so saving a cable never throws away the user's zoom. */
let mapZoom: number | null = null;

export function getMapZoom(): number | null {
  return mapZoom;
}

export function setMapZoom(z: number | null) {
  mapZoom = z;
}
