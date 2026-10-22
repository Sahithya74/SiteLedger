import "server-only";
import { directoryPlacesProvider } from "./directory-provider";
import { overpassPlacesProvider } from "./overpass-provider";
import type { PlacesProvider } from "./types";

export type { NearbyPlace, PlacesProvider } from "./types";

/** Providers in display order. Add a Google Places / Mapbox provider here later. */
export function placesProviders(): PlacesProvider[] {
  const providers: PlacesProvider[] = [directoryPlacesProvider];
  if (process.env.MAPS_OVERPASS_ENABLED === "true") providers.push(overpassPlacesProvider);
  return providers;
}

/** Map tile source (OpenStreetMap by default — no key needed). */
export function mapTileConfig() {
  return {
    url: process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ??
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  };
}
