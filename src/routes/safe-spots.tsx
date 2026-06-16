import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getSafeOutdoorSpots, type SpotCategory } from "@/lib/pollen.functions";
import { pollenColor, pollenLabel } from "@/lib/google-maps-loader";
import { useHomeLocation } from "@/hooks/use-home-location";
import { useAllergies } from "@/hooks/use-allergies";
import { useFavoriteSpots } from "@/hooks/use-favorite-spots";
import { FavoriteSpotsAlert } from "@/components/FavoriteSpotsAlert";
import { PollenMap } from "@/components/PollenMap";
import {
  Trees,
  Dumbbell,
  MapPin,
  Navigation,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  X,
  Star,
} from "lucide-react";

export const Route = createFileRoute("/safe-spots")({
  head: () => ({
    meta: [
      { title: "Safe Outdoor Spots — PollenPath" },
      {
        name: "description",
        content:
          "Find nearby parks and sports grounds ranked by today's pollen index for a safer outdoor workout.",
      },
      { property: "og:title", content: "Safe Outdoor Spots — PollenPath" },
      {
        property: "og:description",
        content: "Compare local parks and sports grounds by live pollen index.",
      },
    ],
  }),
  component: SafeSpotsScreen,
});

type Spot = Awaited<ReturnType<typeof getSafeOutdoorSpots>>[number];

const CATEGORY_META: Record<
  SpotCategory,
  { label: string; Icon: typeof Trees }
> = {
  PARK: { label: "Parks", Icon: Trees },
  SPORTS: { label: "Sports", Icon: Dumbbell },
};

function SafeSpotsScreen() {
  const { home } = useHomeLocation();
  const { categories: allergyCategories } = useAllergies();
  const { favorites, isFavorite, toggle: toggleFavorite } = useFavoriteSpots();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locError, setLocError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SpotCategory[]>(["PARK", "SPORTS"]);
  const [selected, setSelected] = useState<Spot | null>(null);

  // Use home location if set, otherwise prompt geolocation.
  useEffect(() => {
    if (home) {
      setCoords({ lat: home.lat, lng: home.lng });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocError("Location not available");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocError("Allow location access or set a home location in Settings."),
      { timeout: 6000 },
    );
  }, [home]);

  const fetchSpots = useServerFn(getSafeOutdoorSpots);
  const query = useQuery({
    queryKey: [
      "safe-spots",
      coords?.lat.toFixed(3),
      coords?.lng.toFixed(3),
      filters.slice().sort().join(","),
    ],
    queryFn: () =>
      fetchSpots({
        data: {
          lat: coords!.lat,
          lng: coords!.lng,
          radius: 3000,
          categories: filters,
        },
      }),
    enabled: !!coords && filters.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Score by user's tracked allergens when available, else overall max.
  const ranked = useMemo(() => {
    if (!query.data) return [];
    const codeMap: Record<string, string> = {
      TREE: "TREE_UPI",
      GRASS: "GRASS_UPI",
      WEED: "WEED_UPI",
    };
    const watchCodes =
      allergyCategories.length > 0
        ? allergyCategories.map((c) => codeMap[c])
        : null;
    return query.data
      .map((s) => {
        const relevant = watchCodes
          ? Math.max(
              0,
              ...watchCodes.map((c) => s.pollen[c] ?? 0),
            )
          : s.pollenMax ?? 0;
        return { ...s, score: relevant };
      })
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return a.distanceKm - b.distanceKm;
      });
  }, [query.data, allergyCategories]);

  const toggleFilter = (c: SpotCategory) =>
    setFilters((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );

  // Build map markers from ranked spots, color-coded by pollen score.
  const spotHotspots = useMemo(
    () =>
      ranked.map((s) => ({
        lat: s.lat,
        lng: s.lng,
        color: pollenColor(s.score),
        title: s.name,
        breakdown: `<div><strong>${CATEGORY_META[s.category].label}</strong> · ${s.distanceKm.toFixed(1)} km</div><div style="margin-top:4px">Pollen <strong>${s.score}/5</strong> · ${pollenLabel(s.score)}</div>`,
      })),
    [ranked],
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-background pb-20">
      <header className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Safe outdoor spots
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Nearby parks and sports grounds ranked by today's pollen — lowest first.
          </p>
          <div className="mt-3 flex gap-2">
            {(Object.keys(CATEGORY_META) as SpotCategory[]).map((c) => {
              const { label, Icon } = CATEGORY_META[c];
              const on = filters.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => toggleFilter(c)}
                  aria-pressed={on}
                  className={
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors " +
                    (on
                      ? "bg-[image:var(--gradient-warn)] text-primary-foreground shadow-sm"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80")
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
          {home ? (
            <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3" /> Searching near {home.label}
            </p>
          ) : coords ? (
            <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Navigation className="h-3 w-3" /> Using current location
            </p>
          ) : null}
        </div>
      </header>

      <main className="mt-3 flex-1 px-4">
        {coords && (
          <div className="mb-3 h-56 overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-soft)]">
            <PollenMap
              layer="NONE"
              center={coords}
              zoom={14}
              userLocation={coords}
              hotspots={spotHotspots}
            />
          </div>
        )}

        {favorites.length > 0 && (
          <div className="mb-3 space-y-2">
            <FavoriteSpotsAlert />
          </div>
        )}

        {locError && !coords && (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            {locError}
          </div>
        )}

        {coords && filters.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Pick at least one category above.
          </div>
        )}

        {coords && filters.length > 0 && query.isPending && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Scanning the
            neighbourhood…
          </div>
        )}

        {query.isError && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Couldn't load nearby spots. Try again in a moment.
          </div>
        )}

        {query.data && ranked.length === 0 && !query.isPending && (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            No matching spots within ~3 km.
          </div>
        )}

        {ranked.length > 0 && (
          <ul className="space-y-2">
            {ranked.map((s, idx) => {
              const Icon = CATEGORY_META[s.category].Icon;
              const isSafest = idx === 0 && s.score <= 2;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setSelected(s)}
                    className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-[var(--shadow-soft)] transition-colors hover:bg-accent/30"
                  >
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: pollenColor(s.score) }}
                    >
                      <Icon className="h-5 w-5 text-foreground/80" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {s.name}
                        </span>
                        {isSafest && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-[color:var(--pollen-0)]/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground">
                            <ShieldCheck className="h-2.5 w-2.5" /> Safest
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {CATEGORY_META[s.category].label} ·{" "}
                        {s.distanceKm.toFixed(1)} km away
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={
                          isFavorite(s.id)
                            ? "Remove from favorites"
                            : "Save to favorites"
                        }
                        aria-pressed={isFavorite(s.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite({
                            id: s.id,
                            name: s.name,
                            lat: s.lat,
                            lng: s.lng,
                            category: s.category,
                            address: s.address,
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleFavorite({
                              id: s.id,
                              name: s.name,
                              lat: s.lat,
                              lng: s.lng,
                              category: s.category,
                              address: s.address,
                            });
                          }
                        }}
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Star
                          className={
                            "h-4 w-4 " +
                            (isFavorite(s.id)
                              ? "fill-[color:var(--pollen-3)] text-[color:var(--pollen-3)]"
                              : "")
                          }
                        />
                      </span>
                      <span className="text-right">
                      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                        Pollen
                      </span>
                      <span className="block text-sm font-bold text-foreground">
                        {s.score}/5
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {pollenLabel(s.score)}
                      </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 text-[10px] leading-snug text-muted-foreground">
          Pollen values come from Google's Pollen API for each spot's coordinates
          and reflect today's forecast. Scores use your tracked allergens
          (Settings) when available.
        </p>
      </main>

      {selected && (
        <SpotSheet
          spot={selected}
          isFavorite={isFavorite(selected.id)}
          onToggleFavorite={() =>
            toggleFavorite({
              id: selected.id,
              name: selected.name,
              lat: selected.lat,
              lng: selected.lng,
              category: selected.category,
              address: selected.address,
            })
          }
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function SpotSheet({
  spot,
  isFavorite,
  onToggleFavorite,
  onClose,
}: {
  spot: Spot;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
}) {
  const score =
    spot.pollenMax ?? Math.max(0, ...Object.values(spot.pollen));
  const isSafe = score <= 2;
  const Icon = CATEGORY_META[spot.category].Icon;
  const destinationParam = `${spot.lat.toFixed(6)},${spot.lng.toFixed(6)}`;
  return (
    <div className="fixed inset-x-0 bottom-16 z-30 px-3">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Icon className="h-3 w-3" /> {CATEGORY_META[spot.category].label}
            </p>
            <p className="truncate text-sm font-semibold text-foreground">
              {spot.name}
            </p>
            {spot.address && (
              <p className="truncate text-[11px] text-muted-foreground">
                {spot.address}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={onToggleFavorite}
              aria-pressed={isFavorite}
              aria-label={
                isFavorite ? "Remove from favorites" : "Save to favorites"
              }
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Star
                className={
                  "h-4 w-4 " +
                  (isFavorite
                    ? "fill-[color:var(--pollen-3)] text-[color:var(--pollen-3)]"
                    : "")
                }
              />
            </button>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          className={
            "mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs " +
            (isSafe
              ? "bg-[color:var(--pollen-0)]/30 text-foreground"
              : "bg-[color:var(--pollen-4)]/20 text-foreground")
          }
        >
          {isSafe ? (
            <ShieldCheck className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          <span>
            {isSafe
              ? "Good to train here today — overall pollen is low."
              : "Heads up: pollen is elevated. Consider mask, antihistamine, or a different spot."}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["TREE_UPI", "GRASS_UPI", "WEED_UPI"] as const).map((code) => {
            const v = spot.pollen[code] ?? 0;
            const label =
              code === "TREE_UPI"
                ? "Tree"
                : code === "GRASS_UPI"
                  ? "Grass"
                  : "Weed";
            return (
              <div
                key={code}
                className="rounded-xl border border-border bg-background p-2"
              >
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {label}
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
                <p className="text-[10px] text-muted-foreground">{v}/5</p>
              </div>
            );
          })}
        </div>

        <Link
          to="/safe-route"
          search={{ destination: destinationParam }}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[image:var(--gradient-warn)] px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm"
        >
          <Navigation className="h-4 w-4" /> Directions
        </Link>
      </div>
    </div>
  );
}