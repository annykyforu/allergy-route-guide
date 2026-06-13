import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PollenMap } from "@/components/PollenMap";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { RouteExposureTimeline } from "@/components/RouteExposureTimeline";
import {
  findSafeRoutes,
  getRouteExposureForecast,
  type SafeRoute,
  type PollenSample,
} from "@/lib/safe-route.functions";
import { geocodeAddress } from "@/lib/pollen.functions";
import { pollenColor, pollenHex, pollenLabel } from "@/lib/google-maps-loader";
import { useAllergies } from "@/hooks/use-allergies";
import { Shield, AlertTriangle, Loader2, Footprints, Bike, Bus, Car, Settings as SettingsIcon } from "lucide-react";

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
  const [travelMode, setTravelMode] = useState<
    "WALK" | "BICYCLE" | "TRANSIT" | "DRIVE"
  >("WALK");
  const [routes, setRoutes] = useState<SafeRoute[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { profile, categories, plants } = useAllergies();

  const geocode = useServerFn(geocodeAddress);
  const compute = useServerFn(findSafeRoutes);
  const exposureFn = useServerFn(getRouteExposureForecast);

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
          travelMode,
          allergyProfile: profile,
        },
      });
      setRoutes(result.routes);
      const safest = result.routes.find((r) => r.safest) ?? result.routes[0];
      if (safest) setSelectedIndex(safest.index);
      return result;
    },
    onError: (e: Error) => setError(e.message),
  });

  const selectedRoute = useMemo(
    () => routes.find((r) => r.index === selectedIndex) ?? null,
    [routes, selectedIndex],
  );

  // Non-selected routes render as grey single-color polylines.
  const polylines = routes
    .filter((r) => r.index !== selectedIndex)
    .map((r) => ({
      path: r.decodedPath,
      color: "#9CA3AF",
      weight: 4,
      opacity: 0.45,
    }));

  // Selected route renders as segments colored by personalized pollen.
  const segments = useMemo(() => {
    if (!selectedRoute || selectedRoute.samples.length < 2) return [];
    const samples = selectedRoute.samples;
    return samples.slice(0, -1).map((s, i) => ({
      from: { lat: s.lat, lng: s.lng },
      to: { lat: samples[i + 1].lat, lng: samples[i + 1].lng },
      color: pollenHex((s.personalized + samples[i + 1].personalized) / 2),
      weight: 8,
      opacity: 0.95,
    }));
  }, [selectedRoute]);

  // Top hotspots on the selected route (up to 3, only meaningful values).
  const hotspots = useMemo(() => {
    if (!selectedRoute) return [];
    return [...selectedRoute.samples]
      .filter((s) => s.personalized >= 2)
      .sort((a, b) => b.personalized - a.personalized)
      .slice(0, 3)
      .map((s) => ({
        lat: s.lat,
        lng: s.lng,
        color: pollenHex(s.personalized),
        title: `${pollenLabel(Math.round(s.personalized))} pollen here`,
        breakdown: buildBreakdownHtml(s),
      }));
  }, [selectedRoute]);

  // 5-day exposure forecast at the selected route's midpoint.
  const midpoint = useMemo(() => {
    if (!selectedRoute?.decodedPath.length) return null;
    return selectedRoute.decodedPath[
      Math.floor(selectedRoute.decodedPath.length / 2)
    ];
  }, [selectedRoute]);

  const exposureQuery = useQuery({
    queryKey: [
      "exposure",
      midpoint?.lat,
      midpoint?.lng,
      categories.join(","),
      plants.join(","),
    ],
    queryFn: () =>
      exposureFn({
        data: {
          lat: midpoint!.lat,
          lng: midpoint!.lng,
          allergyProfile: profile,
        },
      }),
    enabled: !!midpoint,
    staleTime: 1000 * 60 * 30,
  });

  const profileEmpty = categories.length === 0 && plants.length === 0;
  const profileLabel = plants.length
    ? plants
        .slice(0, 3)
        .map((p) => p.charAt(0) + p.slice(1).toLowerCase().replace("_", " "))
        .join(", ") + (plants.length > 3 ? ` +${plants.length - 3}` : "")
    : categories
        .map((c) => c.charAt(0) + c.slice(1).toLowerCase())
        .join(", ");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Safe route finder
        </h1>
        <p className="text-sm text-muted-foreground">
          Color-coded by personalized pollen exposure.
        </p>
        <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs">
          <span className="text-muted-foreground">Scoring for:</span>
          <span className="font-medium text-foreground">
            {profileEmpty ? "All pollen (no profile set)" : profileLabel}
          </span>
          <Link
            to="/settings"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            aria-label="Edit allergy profile"
          >
            <SettingsIcon className="h-3 w-3" />
            Edit
          </Link>
        </div>
      </header>

      <div className="px-4 space-y-2">
        <AddressAutocomplete
          value={origin}
          onChange={setOrigin}
          placeholder="From (address or place)"
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <AddressAutocomplete
          value={destination}
          onChange={setDestination}
          placeholder="To (address or place)"
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div
          role="radiogroup"
          aria-label="Travel mode"
          className="grid grid-cols-4 gap-2"
        >
          {(
            [
              { mode: "WALK", label: "Walk", Icon: Footprints },
              { mode: "BICYCLE", label: "Bike", Icon: Bike },
              { mode: "TRANSIT", label: "Transit", Icon: Bus },
              { mode: "DRIVE", label: "Drive", Icon: Car },
            ] as const
          ).map(({ mode, label, Icon }) => {
            const active = travelMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTravelMode(mode)}
                className={
                  "flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring " +
                  (active
                    ? "border-primary bg-accent text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground")
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
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

      <div className="mt-4 mx-4 h-[50vh] overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-soft)]">
        <PollenMap
          layer="NONE"
          polylines={polylines}
          segments={segments}
          hotspots={hotspots}
        />
      </div>

      {selectedRoute && (
        <div className="mt-3 mx-4 flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 text-[11px]">
          <span className="font-semibold uppercase tracking-wide text-muted-foreground">
            Exposure
          </span>
          <div className="flex flex-1 items-center gap-1">
            {[0, 1, 2, 3, 4, 5].map((v) => (
              <div key={v} className="flex flex-1 flex-col items-center gap-0.5">
                <div
                  className="h-2 w-full rounded-full"
                  style={{ background: pollenColor(v) }}
                />
                <span className="text-[9px] text-muted-foreground">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedRoute && (
        <div className="mt-3 mx-4">
          <RouteExposureTimeline
            days={exposureQuery.data?.days ?? []}
            loading={exposureQuery.isPending}
          />
        </div>
      )}

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
                    background: pollenColor(Math.round(r.personalizedAvg)),
                  }}
                />
                <span className="text-xs text-foreground">
                  Your risk{" "}
                  <strong>{r.personalizedAvg.toFixed(1)}/5</strong> ·{" "}
                  {pollenLabel(Math.round(r.personalizedAvg))} (peak{" "}
                  {r.personalizedMax}/5)
                  {r.worstPlant && (
                    <>
                      {" "}— mostly{" "}
                      <strong className="text-foreground">{r.worstPlant}</strong>
                    </>
                  )}
                </span>
              </div>
              {/* Mini segment bar showing exposure across the route */}
              <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full">
                {r.samples.map((s, i) => (
                  <div
                    key={i}
                    className="h-full flex-1"
                    style={{ background: pollenColor(Math.round(s.personalized)) }}
                    title={`${s.worstContributor ?? "Pollen"} ${s.personalized}/5`}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>start</span>
                <span>end</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function buildBreakdownHtml(s: PollenSample): string {
  const rows: string[] = [];
  // Plants first, sorted by value desc, only meaningful values.
  const plantRows = Object.entries(s.plantScores)
    .filter(([, v]) => v.value > 0)
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 5)
    .map(
      ([code, v]) =>
        `<div>${prettify(code)}: <strong>${v.value}/5</strong>${v.inSeason ? " · in season" : ""}</div>`,
    );
  rows.push(...plantRows);
  // Always show category fallback line.
  rows.push(
    `<div style="margin-top:4px;color:#777;">Tree ${s.categoryScores.TREE}/5 · Grass ${s.categoryScores.GRASS}/5 · Weed ${s.categoryScores.WEED}/5</div>`,
  );
  return rows.join("");
}

function prettify(code: string): string {
  return code
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}