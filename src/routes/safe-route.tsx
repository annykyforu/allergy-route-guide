import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { PollenMap } from "@/components/PollenMap";
import { findSafeRoutes, type SafeRoute } from "@/lib/safe-route.functions";
import { geocodeAddress } from "@/lib/pollen.functions";
import { pollenColor, pollenLabel } from "@/lib/google-maps-loader";
import { Shield, AlertTriangle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/safe-route")({
  head: () => ({
    meta: [
      { title: "Safe routes — PollenPath" },
      {
        name: "description",
        content:
          "Find the route with the lowest pollen exposure between two points.",
      },
      { property: "og:title", content: "Safe routes — PollenPath" },
      {
        property: "og:description",
        content: "Route around parks and high-pollen areas.",
      },
    ],
  }),
  component: SafeRouteScreen,
});

function SafeRouteScreen() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [routes, setRoutes] = useState<SafeRoute[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const geocode = useServerFn(geocodeAddress);
  const compute = useServerFn(findSafeRoutes);

  const mutation = useMutation({
    mutationFn: async () => {
      setError(null);
      setSelectedIndex(null);
      const [a, b] = await Promise.all([
        geocode({ data: { address: origin } }),
        geocode({ data: { address: destination } }),
      ]);
      const result = await compute({
        data: {
          origin: { lat: a.lat, lng: a.lng },
          destination: { lat: b.lat, lng: b.lng },
          travelMode: "WALK",
        },
      });
      setRoutes(result.routes);
      const safest = result.routes.find((r) => r.safest) ?? result.routes[0];
      if (safest) setSelectedIndex(safest.index);
      return result;
    },
    onError: (e: Error) => setError(e.message),
  });

  const polylines = routes.map((r) => {
    const isSelected = r.index === selectedIndex;
    return {
      path: r.decodedPath,
      color: isSelected ? (r.safest ? "#16A34A" : "#2563EB") : "#9CA3AF",
      weight: isSelected ? 7 : 4,
      opacity: isSelected ? 0.95 : 0.45,
    };
  });

  return (
    <div className="flex h-screen flex-col">
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Safe route finder
        </h1>
        <p className="text-sm text-muted-foreground">
          We compare alternatives and highlight the one with the least pollen.
        </p>
      </header>

      <div className="px-4 space-y-2">
        <input
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="From (address or place)"
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="To (address or place)"
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          disabled={
            !origin || !destination || mutation.isPending
          }
          onClick={() => mutation.mutate()}
          className="w-full rounded-xl bg-[image:var(--gradient-warn)] px-4 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)] transition-opacity disabled:opacity-50"
        >
          {mutation.isPending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Finding safest route…
            </span>
          ) : (
            "Find safe route"
          )}
        </button>
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="mt-4 mx-4 min-h-64 flex-1 overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-soft)]">
        <PollenMap layer="NONE" polylines={polylines} />
      </div>

      {routes.length > 0 && (
        <ul className="mt-4 max-h-[40vh] space-y-2 overflow-y-auto px-4 pb-4">
          {routes.map((r) => (
            <li
              key={r.index}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedIndex(r.index)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedIndex(r.index);
                }
              }}
              aria-pressed={selectedIndex === r.index}
              className={
                "cursor-pointer rounded-2xl border p-4 transition-all focus:outline-none focus:ring-2 focus:ring-ring " +
                (selectedIndex === r.index
                  ? r.safest
                    ? "border-[oklch(0.55_0.15_145)] bg-[oklch(0.95_0.06_145)] ring-2 ring-[oklch(0.55_0.15_145)]"
                    : "border-primary bg-accent ring-2 ring-primary"
                  : "border-border bg-card hover:border-foreground/30")
              }
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {r.safest && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.55_0.15_145)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      <Shield className="h-3 w-3" /> Safest
                    </span>
                  )}
                  <span className="text-sm font-semibold text-foreground">
                    Route {r.index + 1}
                  </span>
                  {selectedIndex === r.index && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Selected
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {(r.distanceMeters / 1000).toFixed(1)} km ·{" "}
                  {Math.round(r.durationSeconds / 60)} min
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-3 w-3 rounded-full"
                  style={{
                    background: pollenColor(Math.round(r.averagePollen)),
                  }}
                />
                <span className="text-xs text-foreground">
                  Avg pollen{" "}
                  <strong>{r.averagePollen.toFixed(1)}/5</strong> ·{" "}
                  {pollenLabel(Math.round(r.averagePollen))} (peak{" "}
                  {r.maxPollen}/5)
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}