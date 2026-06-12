import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getPollenForecast,
  geocodeAddress,
  reverseGeocode,
  getIpLocation,
  type PollenForecast,
} from "@/lib/pollen.functions";
import { pollenColor, pollenLabel } from "@/lib/google-maps-loader";
import { MapPin, Search, Loader2 } from "lucide-react";

export const Route = createFileRoute("/forecast")({
  head: () => ({
    meta: [
      { title: "5-day pollen forecast — PollenPath" },
      {
        name: "description",
        content:
          "Five-day pollen forecast with tree, grass, and weed breakdown.",
      },
      { property: "og:title", content: "5-day pollen forecast — PollenPath" },
      {
        property: "og:description",
        content: "Plan ahead with a 5-day pollen forecast.",
      },
    ],
  }),
  component: ForecastScreen,
});

function ForecastScreen() {
  const [loc, setLoc] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);
  const [query, setQuery] = useState("");
  const geocode = useServerFn(geocodeAddress);
  const forecast = useServerFn(getPollenForecast);
  const reverse = useServerFn(reverseGeocode);
  const ipLocate = useServerFn(getIpLocation);

  useEffect(() => {
    if (loc || typeof navigator === "undefined" || !navigator.geolocation) return;
    const fallback = async () => {
      try {
        const ip = await ipLocate();
        if (ip) {
          setLoc(ip);
          return;
        }
      } catch {
        /* fall through */
      }
      setLoc({ lat: 40.7128, lng: -74.006, label: "New York City" });
    };
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let label = "Current location";
        try {
          const r = await reverse({ data: { lat, lng } });
          label = r.label;
        } catch {
          /* keep fallback */
        }
        setLoc({ lat, lng, label });
      },
      () => {
        void fallback();
      },
      { timeout: 6000 },
    );
  }, [loc]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["forecast", loc?.lat, loc?.lng],
    queryFn: () =>
      forecast({ data: { lat: loc!.lat, lng: loc!.lng, days: 5 } }),
    enabled: !!loc,
  });

  const onSearch = async () => {
    if (!query.trim()) return;
    try {
      const r = await geocode({ data: { address: query } });
      setLoc({ lat: r.lat, lng: r.lng, label: r.address });
    } catch {
      /* ignored */
    }
  };

  return (
    <div className="flex flex-col">
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          5-day forecast
        </h1>
        <p className="text-sm text-muted-foreground">
          Pollen outlook for any location
        </p>
      </header>

      <div className="px-4">
        <div className="flex gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              placeholder="Search city or address"
              className="w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <button
            onClick={onSearch}
            className="rounded-xl bg-[image:var(--gradient-warn)] px-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)]"
          >
            Go
          </button>
        </div>
        {loc && (
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {loc.label}
          </p>
        )}
      </div>

      <div className="mt-4 px-4 space-y-3 pb-6">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading forecast…
          </div>
        )}
        {isError && (
          <div className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
            Couldn't load forecast for this location.
          </div>
        )}
        {data?.dailyInfo?.map((day, idx) => (
          <DayCard key={idx} day={day} isToday={idx === 0} />
        ))}
      </div>
    </div>
  );
}

function DayCard({
  day,
  isToday,
}: {
  day: PollenForecast["dailyInfo"][number];
  isToday: boolean;
}) {
  const date = new Date(day.date.year, day.date.month - 1, day.date.day);
  const label = isToday
    ? "Today"
    : date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
  const max = Math.max(
    0,
    ...day.pollenTypeInfo.map((t) => t.indexInfo?.value ?? 0),
  );
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{label}</h2>
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: pollenColor(max) }}
          />
          <span className="text-xs font-medium text-muted-foreground">
            Peak {pollenLabel(max)}
          </span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {day.pollenTypeInfo.map((t) => {
          const v = t.indexInfo?.value ?? 0;
          return (
            <div
              key={t.code}
              className="rounded-xl bg-background border border-border p-2"
            >
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t.displayName ?? t.code}
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: pollenColor(v) }}
                />
                <span className="text-xs font-semibold text-foreground">
                  {v}/5
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {pollenLabel(v)}
              </p>
            </div>
          );
        })}
      </div>
      {isToday &&
        day.pollenTypeInfo[0]?.healthRecommendations?.[0] && (
          <p className="mt-3 rounded-lg bg-accent/40 p-2 text-xs text-accent-foreground">
            {day.pollenTypeInfo[0].healthRecommendations[0]}
          </p>
        )}
    </article>
  );
}