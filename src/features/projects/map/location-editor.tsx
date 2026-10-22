"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Crosshair, MapPin } from "lucide-react";
import { FormError, SubmitButton, TextAreaField, TextField, useActionForm } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { INDIA_CENTER, type LatLng } from "@/lib/geo";
import { updateProjectLocationAction } from "../actions";
import type { MapPoint } from "./site-map";

// Leaflet needs the browser, so the map is loaded only on the client.
const SiteMap = dynamic(() => import("./site-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-[360px] w-full rounded-lg md:h-[440px]" />,
});

export function LocationEditor({
  projectId,
  site,
  address,
  points,
  canEdit,
  tileUrl,
  attribution,
}: {
  projectId: string;
  site: LatLng | null;
  address: string;
  points: MapPoint[];
  canEdit: boolean;
  tileUrl: string;
  attribution: string;
}) {
  const [pin, setPin] = useState<LatLng | null>(site);
  const [lat, setLat] = useState(site ? String(site.lat) : "");
  const [lng, setLng] = useState(site ? String(site.lng) : "");
  const [locating, setLocating] = useState(false);
  const action = useMemo(() => updateProjectLocationAction.bind(null, projectId), [projectId]);
  const { onSubmit, pending, fieldErrors: e, formError } = useActionForm(action);

  function pick(p: LatLng) {
    setPin(p);
    setLat(String(p.lat));
    setLng(String(p.lng));
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        pick({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function typed(nextLat: string, nextLng: string) {
    setLat(nextLat);
    setLng(nextLng);
    const a = Number(nextLat);
    const b = Number(nextLng);
    if (nextLat && nextLng && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) setPin({ lat: a, lng: b });
  }

  return (
    <div className="flex flex-col gap-4">
      <SiteMap
        site={pin}
        fallbackCenter={INDIA_CENTER}
        points={points}
        onPick={canEdit ? pick : undefined}
        tileUrl={tileUrl}
        attribution={attribution}
      />
      {canEdit && (
        <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-4" />
            {pin ? "Click the map to move the pin, or type the coordinates." : "Click on the map where the site is, or type the coordinates."}
          </p>
          <FormError message={Object.keys(e).length ? null : formError} />
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <TextField label="Latitude" name="latitude" value={lat} onChange={(ev) => typed(ev.target.value, lng)} error={e.latitude} inputMode="decimal" />
            <TextField label="Longitude" name="longitude" value={lng} onChange={(ev) => typed(lat, ev.target.value)} error={e.longitude} inputMode="decimal" />
            <Button type="button" variant="outline" size="lg" onClick={useMyLocation} disabled={locating}>
              <Crosshair className="size-4" /> {locating ? "Finding…" : "I'm at the site"}
            </Button>
          </div>
          <TextAreaField label="Site address" name="address" defaultValue={address} error={e.address} rows={2} />
          <div>
            <SubmitButton pending={pending}>Save location</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
