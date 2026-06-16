import { useMemo, useState, useEffect } from "react";
import { useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, X, MapPin } from "lucide-react";
import { getPollenForecast } from "@/lib/pollen.functions";
import { useAllergies, type AllergyCategory } from "@/hooks/use-allergies";
import { useFavoriteSpots, type FavoriteSpot } from "@/hooks/use-favorite-spots";
import { pollenLabel, pollenHex } from "@/lib/google-maps-loader";

function codeToCategory(code: string): AllergyCategory | null {
  if (code.startsWith("TREE")) return "TREE";
  if (code.startsWith("GRASS")) return "GRASS";
  if (code.startsWith("WEED")) return "WEED";
  return null;
}

type Warning = {
  spot: FavoriteSpot;
  date: Date;
  value: number;
  todayValue: number;
  typeLabel: string;
  reason: "high" | "jump" | "both";
};

function dismissKey(w: Warning) {
  return `pollenpath.fav-alert.dismissed.${w.spot.id}.${w.date
    .toISOString()
    .slice(0, 10)}.${w.typeLabel}.${w.value}`;
}

export function FavoriteSpotsAlert() {
  const { favorites } = useFavoriteSpots();
  const { categories } = useAllergies();
  const fetchForecast = useServerFn(getPollenForecast);

  const queries = useQueries({
    queries: favorites.map((f) => ({
      queryKey: ["fav-forecast", f.id, f.lat.toFixed(3), f.lng.toFixed(3)],
      queryFn: () =>
        fetchForecast({ data: { lat: f.lat, lng: f.lng, days: 5 } }),
      staleTime: 30 * 60 * 1000,
    })),
  });

  const warnings = useMemo<Warning[]>(() => {
    if (categories.length === 0) return [];
    const out: Warning[] = [];
    favorites.forEach((spot, i) => {
      const data = queries[i]?.data;
      const days = data?.dailyInfo;
      if (!days || days.length < 2) return;
      const today = days[0];
      const relevant = (code: string) => {
        const cat = codeToCategory(code);
        return cat !== null && categories.includes(cat);
      };
      const todayBy = new Map<string, number>();
      for (const t of today.pollenTypeInfo) {
        if (!relevant(t.code)) continue;
        todayBy.set(t.code, t.indexInfo?.value ?? 0);
      }
      let best: Warning | null = null;
      for (let j = 1; j < days.length; j++) {
        const d = days[j];
        for (const t of d.pollenTypeInfo) {
          if (!relevant(t.code)) continue;
          const v = t.indexInfo?.value ?? 0;
          const tv = todayBy.get(t.code) ?? 0;
          const high = v >= 4;
          const jump = v - tv >= 2;
          if (!high && !jump) continue;
          const reason: Warning["reason"] =
            high && jump ? "both" : high ? "high" : "jump";
          const cand: Warning = {
            spot,
            date: new Date(d.date.year, d.date.month - 1, d.date.day),
            value: v,
            todayValue: tv,
            typeLabel: t.displayName ?? t.code,
            reason,
          };
          if (!best || cand.value > best.value) best = cand;
        }
      }
      if (best) out.push(best);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites, categories, queries.map((q) => q.dataUpdatedAt).join(",")]);

  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    const next = new Set<string>();
    for (const w of warnings) {
      try {
        if (window.localStorage.getItem(dismissKey(w)) === "1")
          next.add(dismissKey(w));
      } catch {}
    }
    setDismissedKeys(next);
  }, [warnings]);

  const visible = warnings.filter((w) => !dismissedKeys.has(dismissKey(w)));
  if (visible.length === 0) return null;

  const dismiss = (w: Warning) => {
    const k = dismissKey(w);
    setDismissedKeys((prev) => new Set(prev).add(k));
    try {
      window.localStorage.setItem(k, "1");
    } catch {}
  };

  return (
    <div className="space-y-2">
      {visible.map((w) => {
        const day = w.date.toLocaleDateString(undefined, { weekday: "long" });
        const reasonText =
          w.reason === "high"
            ? `${w.typeLabel} reaching ${pollenLabel(w.value)} (${w.value}/5)`
            : w.reason === "jump"
              ? `${w.typeLabel} jumping from ${w.todayValue} to ${w.value}/5`
              : `${w.typeLabel} surging to ${pollenLabel(w.value)} (${w.todayValue} → ${w.value}/5)`;
        return (
          <div
            key={dismissKey(w)}
            role="alert"
            className="rounded-2xl border border-border bg-card/95 p-3 shadow-[var(--shadow-soft)] backdrop-blur"
          >
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-primary-foreground"
                style={{ background: pollenHex(w.value) }}
              >
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                  Favorite spot alert
                </p>
                <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-foreground">
                  <MapPin className="h-3 w-3" />
                  <span className="font-semibold">{w.spot.name}</span>
                </p>
                <p className="mt-0.5 text-xs text-foreground">
                  <span className="font-semibold">{day}</span> — {reasonText}.
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Consider another spot or your usual precautions on that day.
                </p>
              </div>
              <button
                onClick={() => dismiss(w)}
                aria-label="Dismiss alert"
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}