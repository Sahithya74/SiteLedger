export type LatLng = { lat: number; lng: number };

/** Great-circle distance in kilometres (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function googleMapsPinUrl(p: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
}

export function googleMapsDirectionsUrl(p: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
}

/** Opens Google Maps searching for e.g. "cement dealer" around a point (real, live results). */
export function googleMapsNearbySearchUrl(query: string, p: LatLng): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${p.lat},${p.lng},14z`;
}

/** Centre of India, used when a project has no pin yet. */
export const INDIA_CENTER: LatLng = { lat: 20.5937, lng: 78.9629 };
