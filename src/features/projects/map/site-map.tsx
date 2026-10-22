"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import L from "leaflet";
import { AttributionControl, CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { LatLng } from "@/lib/geo";

export type MapPoint = { id: string; name: string; location: LatLng; detail?: string };

// An HTML pin avoids Leaflet's default image icons (which break with bundlers).
const sitePin = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#b45309;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

function ClickToPick({ onPick }: { onPick?: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick?.({ lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)) });
    },
  });
  return null;
}

function FollowCenter({ center, zoom }: { center: LatLng; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], Math.max(map.getZoom(), zoom), { animate: true });
  }, [center.lat, center.lng, zoom, map]);
  return null;
}

export default function SiteMap({
  site,
  fallbackCenter,
  points = [],
  onPick,
  tileUrl,
  attribution,
}: {
  site: LatLng | null;
  fallbackCenter: LatLng;
  points?: MapPoint[];
  onPick?: (p: LatLng) => void;
  tileUrl: string;
  attribution: string;
}) {
  const center = site ?? fallbackCenter;
  const zoom = site ? 14 : 5;
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      scrollWheelZoom={false}
      attributionControl={false}
      className="h-[360px] w-full rounded-lg md:h-[440px]"
      style={{ cursor: onPick ? "crosshair" : undefined }}
    >
      <AttributionControl position="bottomright" prefix="Leaflet" />
      <TileLayer url={tileUrl} attribution={attribution} />
      {site && <FollowCenter center={site} zoom={14} />}
      <ClickToPick onPick={onPick} />
      {site && (
        <Marker position={[site.lat, site.lng]} icon={sitePin}>
          <Tooltip direction="top" offset={[0, -24]}>
            Project site
          </Tooltip>
        </Marker>
      )}
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.location.lat, p.location.lng]}
          radius={7}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#2a78d6", fillOpacity: 1 }}
        >
          <Tooltip direction="top">
            <strong>{p.name}</strong>
            {p.detail ? <br /> : null}
            {p.detail}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
