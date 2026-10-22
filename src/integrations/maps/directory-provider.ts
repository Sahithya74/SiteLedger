import "server-only";
import { distanceKm, type LatLng } from "@/lib/geo";
import { db } from "@/server/db";
import type { NearbyPlace, PlacesProvider } from "./types";

const CATEGORY_LABEL: Record<string, string> = {
  HARDWARE: "Hardware",
  CEMENT: "Cement",
  STEEL: "Steel",
  SAND: "Sand",
  STONE: "Stone / aggregates",
  GRANITE: "Granite",
  TILES: "Tiles",
  ELECTRICAL: "Electrical",
  PLUMBING: "Plumbing",
  PAINT: "Paint",
  TRANSPORT: "Transport",
  EQUIPMENT_RENTAL: "Equipment rental",
  OTHER: "Other",
};

/** Suppliers from your own directory that have a location on the map. */
export const directoryPlacesProvider: PlacesProvider = {
  id: "directory",
  label: "Your supplier directory",
  async nearby(center: LatLng, { radiusKm, limit = 30 }) {
    const suppliers = await db.supplier.findMany({
      where: { deletedAt: null, isActive: true, latitude: { not: null }, longitude: { not: null } },
      select: { id: true, name: true, categories: true, address: true, city: true, phone: true, latitude: true, longitude: true },
    });
    const places: NearbyPlace[] = suppliers
      .map((s) => {
        const location = { lat: s.latitude!, lng: s.longitude! };
        return {
          id: s.id,
          name: s.name,
          categories: s.categories.map((c) => CATEGORY_LABEL[c] ?? c),
          address: [s.address, s.city].filter(Boolean).join(", ") || null,
          phone: s.phone,
          location,
          distanceKm: distanceKm(center, location),
          source: "directory" as const,
          href: null,
        };
      })
      .filter((p) => p.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    return places.slice(0, limit);
  },
};
