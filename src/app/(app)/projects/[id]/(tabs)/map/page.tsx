import { Suspense } from "react";
import type { Metadata } from "next";
import { ExternalLink, Navigation, Store } from "lucide-react";
import { ContactLinks } from "@/components/app/contact-links";
import { EmptyState } from "@/components/app/empty-state";
import { Section } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { LocationEditor } from "@/features/projects/map/location-editor";
import { mapTileConfig, placesProviders } from "@/integrations/maps";
import {
  formatDistance,
  googleMapsDirectionsUrl,
  googleMapsNearbySearchUrl,
  googleMapsPinUrl,
} from "@/lib/geo";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { getProject } from "@/server/services/projects";

export const metadata: Metadata = { title: "Project map" };

const RADIUS_KM = 25;

/** Live searches on Google Maps around the site — real businesses, nothing made up. */
const NEARBY_SEARCHES = [
  "Hardware store",
  "Cement dealer",
  "Steel TMT bar dealer",
  "M sand supplier",
  "Blue metal jelly supplier",
  "Granite shop",
  "Tiles showroom",
  "Lorry transport",
  "Electrical shop",
  "Plumbing shop",
];

export default function ProjectMapPage(props: PageProps<"/projects/[id]/map">) {
  return (
    <Suspense fallback={<TableSkeleton rows={6} />}>
      <ProjectMap params={props.params} />
    </Suspense>
  );
}

async function ProjectMap({ params }: { params: PageProps<"/projects/[id]/map">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(user, id);
  if (!project) return null;
  const site = project.latitude !== null && project.longitude !== null ? { lat: project.latitude, lng: project.longitude } : null;
  const providers = placesProviders();
  const results = site
    ? await Promise.all(providers.map(async (p) => ({ provider: p, places: await p.nearby(site, { radiusKm: RADIUS_KM }) })))
    : [];
  const directory = results.find((r) => r.provider.id === "directory")?.places ?? [];
  const tiles = mapTileConfig();

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Section
        title="Site location"
        className="xl:col-span-2"
        actions={
          site && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={googleMapsPinUrl(site)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" /> Google Maps
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={googleMapsDirectionsUrl(site)} target="_blank" rel="noopener noreferrer">
                  <Navigation className="size-4" /> Directions
                </a>
              </Button>
            </div>
          )
        }
      >
        <LocationEditor
          projectId={id}
          site={site}
          address={project.address ?? ""}
          points={directory.map((p) => ({ id: p.id, name: p.name, location: p.location, detail: `${p.categories.join(", ")} · ${formatDistance(p.distanceKm)}` }))}
          canEdit={can(user, "projects.edit") && !project.archivedAt}
          tileUrl={tiles.url}
          attribution={tiles.attribution}
        />
        {site && (
          <p className="mt-3 text-xs text-muted-foreground">
            Coordinates: {site.lat}, {site.lng}
            {project.mapUrl && (
              <>
                {" · "}
                <a href={project.mapUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  Saved map link
                </a>
              </>
            )}
          </p>
        )}
      </Section>

      <div className="flex min-w-0 flex-col gap-6">
        <Section title="Suppliers near this site" description={`From your supplier list, within ${RADIUS_KM} km.`}>
          {!site ? (
            <p className="text-sm text-muted-foreground">Set the site location on the map to see nearby suppliers.</p>
          ) : directory.length === 0 ? (
            <EmptyState
              icon={Store}
              title="No saved suppliers nearby"
              description="Suppliers you save with an address location will appear here, nearest first. Use the Google Maps searches below to find shops around the site."
              className="py-6"
            />
          ) : (
            <ul className="flex flex-col divide-y">
              {directory.map((p) => (
                <li key={p.id} className="flex flex-col gap-0.5 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">{formatDistance(p.distanceKm)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{p.categories.join(" · ")}</span>
                  {p.address && <span className="text-xs text-muted-foreground">{p.address}</span>}
                  <ContactLinks phone={p.phone} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        {results
          .filter((r) => r.provider.id !== "directory")
          .map((r) => (
            <Section key={r.provider.id} title={`Shops on ${r.provider.label}`} description="Construction-related shops mapped by the community.">
              {r.places.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing found nearby, or the map service did not respond.</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {r.places.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className="min-w-0">
                        <a href={p.href ?? "#"} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                          {p.name}
                        </a>
                        <span className="block text-xs text-muted-foreground">{p.categories.join(" · ")}</span>
                      </span>
                      <span className="tabular shrink-0 text-xs text-muted-foreground">{formatDistance(p.distanceKm)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ))}

        {site && (
          <Section title="Search around the site" description="Opens Google Maps with live results near this location.">
            <div className="flex flex-wrap gap-2">
              {NEARBY_SEARCHES.map((q) => (
                <a
                  key={q}
                  href={googleMapsNearbySearchUrl(q, site)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted"
                >
                  {q} <ExternalLink className="size-3 text-muted-foreground" />
                </a>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
