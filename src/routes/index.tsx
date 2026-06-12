import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { PollenMap } from "@/components/PollenMap";
import { PollenBadge, PollenScale } from "@/components/PollenLevel";
import { getPollenForecast } from "@/lib/pollen.functions";
import type { PollenLayer } from "@/lib/google-maps-loader";
import { pollenLabel, pollenColor } from "@/lib/google-maps-loader";
import { Wind, Flower2, Trees, X } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PollenPath — Live pollen map" },
      {
        name: "description",
        content:
          "Tap anywhere on the map to see the live pollen index for that spot.",
      },
      { property: "og:title", content: "PollenPath — Live pollen map" },
      {
        property: "og:description",
        content: "Live pollen heatmap and tap-to-inspect for any location.",
      },
    ],
  }),
  component: MapScreen,
});

const LAYERS: Array<{ id: PollenLayer; label: string; Icon: typeof Trees }> = [
  { id: "TREE_UPI", label: "Trees", Icon: Trees },
  { id: "GRASS_UPI", label: "Grass", Icon: Wind },
  { id: "WEED_UPI", label: "Weeds", Icon: Flower2 },
];

function MapScreen() {
  const [layer, setLayer] = useState<PollenLayer>("TREE_UPI");
  const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [center, setCenter] = useState<{ lat: number; lng: number } | undefined>(
    undefined,
  );

  // Try to center on user location
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 4000 },
    );
  }, []);

  const lookup = useServerFn(getPollenForecast);
  const mutation = useMutation({
    mutationFn: (loc: { lat: number; lng: number }) =>
      lookup({ data: { ...loc, days: 1 } }),
  });

  const handleClick = (lat: number, lng: number) => {
    setMarker({ lat, lng });
    mutation.mutate({ lat, lng });
  };

  const today = mutation.data?.dailyInfo?.[0];

  return (
    <div className="relative flex h-screen w-full flex-col">
      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="rounded-2xl bg-card/95 px-4 py-3 shadow-[var(--shadow-soft)] backdrop-blur">
          <h1 className="text-base font-bold tracking-tight text-foreground">
            PollenPath
          </h1>
          <p className="text-xs text-muted-foreground">
            Tap anywhere to inspect the pollen index
          </p>
        </div>
        {/* Layer toggle */}
        <div className="mt-2 flex gap-1.5 rounded-2xl bg-card/95 p-1.5 shadow-[var(--shadow-soft)] backdrop-blur">
          {LAYERS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setLayer(id)}
              className={
                "flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-medium transition-colors " +
                (layer === id
                  ? "bg-[image:var(--gradient-warn)] text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
          <button
            onClick={() => setLayer("NONE")}
            className={
              "inline-flex items-center justify-center rounded-xl px-2 py-1.5 text-xs font-medium transition-colors " +
              (layer === "NONE"
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
            aria-label="Hide overlay"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Map */}
      <div className="absolute inset-0">
        <PollenMap
          layer={layer}
          center={center}
          onMapClick={handleClick}
          marker={marker}
        />
      </div>

      {/* Legend */}
      <div className="absolute left-3 bottom-3 z-10 flex max-w-[calc(100%-5rem)] items-center gap-2 rounded-xl bg-card/90 px-3 py-2 shadow-[var(--shadow-soft)] backdrop-blur">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Pollen index
        </span>
        <PollenScale />
      </div>

      {/* Bottom sheet */}
      {marker && (
        <div className="absolute inset-x-0 bottom-16 z-30 px-3">
          <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)] border border-border">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Selected location
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {marker.lat.toFixed(4)}, {marker.lng.toFixed(4)}
                </p>
              </div>
              <button
                onClick={() => setMarker(null)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {mutation.isPending && (
              <p className="mt-3 text-sm text-muted-foreground">
                Loading pollen data…
              </p>
            )}
            {mutation.isError && (
              <p className="mt-3 text-sm text-destructive">
                Couldn't fetch pollen data for this spot.
              </p>
            )}
            {today && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {today.pollenTypeInfo.map((t) => {
                  const v = t.indexInfo?.value ?? 0;
                  return (
                    <div
                      key={t.code}
                      className="rounded-xl border border-border bg-background p-2"
                    >
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t.displayName ?? t.code}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: pollenColor(v) }}
                        />
                        <span className="text-xs font-semibold text-foreground">
                          {pollenLabel(v)}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {v}/5
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
            {today &&
              today.pollenTypeInfo[0]?.healthRecommendations?.[0] && (
                <p className="mt-3 rounded-lg bg-accent/40 p-2 text-xs text-accent-foreground">
                  {today.pollenTypeInfo[0].healthRecommendations[0]}
                </p>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
