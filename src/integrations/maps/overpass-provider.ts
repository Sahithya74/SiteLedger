import "server-only";
import { distanceKm, type LatLng } from "@/lib/geo";
import type { NearbyPlace, PlacesProvider } from "./types";

/**
 * Optional: real construction-related shops from OpenStreetMap via the public
 * Overpass API. Off by default (MAPS_OVERPASS_ENABLED=true to turn on).
 * Coverage depends on what local mappers have added.
 */
const ENDPOINT = process.env.MAPS_OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";

const TAG_LABELS: Record<string, string> = {
  hardware: "Hardware",
  doityourself: "Hardware",
  trade: "Building materials",
  building_materials: "Building materials",
  paint: "Paint",
  tiles: "Tiles",
  electrical: "Electrical",
  bathroom_furnishing: "Plumbing",
  stonemason: "Stone / granite",
};

type OverpassElement = {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export const overpassPlacesProvider: PlacesProvider = {
  id: "openstreetmap",
  label: "OpenStreetMap",
  async nearby(center: LatLng, { radiusKm, limit = 30 }) {
    const r = Math.round(radiusKm * 1000);
    const around = `(around:${r},${center.lat},${center.lng})`;
    const query = `[out:json][timeout:15];(
      nwr["shop"~"^(hardware|doityourself|trade|paint|tiles|electrical|bathroom_furnishing)$"]${around};
      nwr["trade"="building_materials"]${around};
      nwr["craft"="stonemason"]${around};
    );out center ${limit * 2};`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
        headers: { "User-Agent": "SITECORE construction management (private use)" },
      });
      if (!res.ok) return [];
      const json = (await res.json()) as { elements?: OverpassElement[] };
      return (json.elements ?? [])
        .map((el): NearbyPlace | null => {
          const lat = el.lat ?? el.center?.lat;
          const lng = el.lon ?? el.center?.lon;
          const name = el.tags?.name;
          if (lat === undefined || lng === undefined || !name) return null;
          const kind = el.tags?.shop ?? el.tags?.trade ?? el.tags?.craft ?? "";
          const location = { lat, lng };
          return {
            id: `${el.type}/${el.id}`,
            name,
            categories: [TAG_LABELS[kind] ?? "Shop"],
            address: [el.tags?.["addr:street"], el.tags?.["addr:city"]].filter(Boolean).join(", ") || null,
            phone: el.tags?.phone ?? el.tags?.["contact:phone"] ?? null,
            location,
            distanceKm: distanceKm(center, location),
            source: "openstreetmap",
            href: `https://www.openstreetmap.org/${el.type}/${el.id}`,
          };
        })
        .filter((p): p is NearbyPlace => p !== null)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, limit);
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  },
};
