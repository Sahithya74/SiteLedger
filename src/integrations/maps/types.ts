import type { LatLng } from "@/lib/geo";

/**
 * Integration layer for "nearby places". The app only talks to this
 * interface, so Google Places, Mapbox or another source can be plugged in
 * later without touching the pages. No provider ever invents businesses —
 * every result comes from real data (your own supplier directory or a map
 * data service).
 */
export type NearbyPlace = {
  id: string;
  name: string;
  categories: string[];
  address: string | null;
  phone: string | null;
  location: LatLng;
  distanceKm: number;
  source: "directory" | "openstreetmap";
  /** In-app link (directory) or external map link. */
  href: string | null;
};

export interface PlacesProvider {
  readonly id: string;
  readonly label: string;
  nearby(center: LatLng, options: { radiusKm: number; limit?: number }): Promise<NearbyPlace[]>;
}
