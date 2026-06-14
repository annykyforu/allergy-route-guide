import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, X } from "lucide-react";
import { getPollenForecast } from "@/lib/pollen.functions";
import { useAllergies, type AllergyCategory } from "@/hooks/use-allergies";
import { useHomeLocation } from "@/hooks/use-home-location";
import { pollenLabel, pollenHex } from "@/lib/google-maps-loader";
import { useState, useEffect } from "react";

// Map Google Pollen `code` -> our category enum.
function codeToCategory(code: string): AllergyCategory | null {
  if (code === "TREE_UPI" || code === "TREE") return "TREE";
  if (code === "GRASS_UPI" || code === "GRASS") return "GRASS";
  if (code === "WEED_UPI" || code === "WEED") return "WEED";
  return null;
}

type Spike = {
  date: Date;
  value: number;
  todayValue: number;
  typeLabel: string;
  reason: "high" | "jump" | "both";
};

function dismissKey(home: { lat: number; lng: number }, spike: Spike) {
  return `pollenpath.alert.dismissed.${home.lat.toFixed(2)},${home.lng.toFixed(
    2,
  )}.${spike.date.toISOString().slice(0, 10)}.${spike.typeLabel}.${spike.value}`;
}

export function SpikeAlert() {
  const { home } = useHomeLocation();
  const { categories } = useAllergies();
  const fetchForecast = useServerFn(getPollenForecast);

  const query = useQuery({
    queryKey: [
      "spike-forecast",
      home?.lat.toFixed(3),
      home?.lng.toFixed(3),
    ],
    queryFn: () =>
      fetchForecast({ data: { lat: home!.lat, lng: home!.lng, days: 5 } }),
    enabled: !!home,
    staleTime: 30 * 60 * 1000,
  });

  const spike = useMemo<Spike | null>(() => {
    const days = query.data?.dailyInfo;
    if (!days || days.length < 2 || categories.length === 0) return null;
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
    let best: Spike | null = null;
    for (let i = 1; i < days.length; i++) {
      const d = days[i];
      for (const t of d.pollenTypeInfo) {
        if (!relevant(t.code)) continue;
        const v = t.indexInfo?.value ?? 0;
        const tv = todayBy.get(t.code) ?? 0;
        const high = v >= 4;
        const jump = v - tv >= 2;
        if (!high && !jump) continue;
        const reason: Spike["reason"] = high && jump ? "both" : high ? "high" : "jump";
        const cand: Spike = {
          date: new Date(d.date.year, d.date.month - 1, d.date.day),
          value: v,
          todayValue: tv,
          typeLabel: t.displayName ?? t.code,
          reason,
        };
        if (!best || cand.value > best.value) best = cand;
      }
    }
    return best;
  }, [query.data, categories]);

  const [dismissed, setDismissed] = useState(false);
  // Reset dismissal when the underlying spike changes.
  useEffect(() => {
    if (!spike || !home) return;
    try {
      const k = dismissKey(home, spike);
      setDismissed(window.localStorage.getItem(k) === "1");
    } catch {
      setDismissed(false);
    }
  }, [spike, home]);

  if (!home || !spike || dismissed) return null;

  const dayLabel = spike.date.toLocaleDateString(undefined, {
    weekday: "long",
  });
  const reasonText =
    spike.reason === "high"
      ? `${spike.typeLabel} reaching ${pollenLabel(spike.value)} (${spike.value}/5)`
      : spike.reason === "jump"
        ? `${spike.typeLabel} jumping from ${spike.todayValue} to ${spike.value}/5`
        : `${spike.typeLabel} surging to ${pollenLabel(spike.value)} (${spike.todayValue} → ${spike.value}/5)`;

  const onDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissKey(home, spike), "1");
    } catch {}
  };

  return (
    <div
      role="alert"
      className="pointer-events-auto rounded-2xl border border-border bg-card/95 p-3 shadow-[var(--shadow-soft)] backdrop-blur"
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-primary-foreground"
          style={{ background: pollenHex(spike.value) }}
        >
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
            Pollen spike forecast
          </p>
          <p className="mt-0.5 text-xs text-foreground">
            <span className="font-semibold">{dayLabel}</span> in{" "}
            <span className="font-semibold">{home.label}</span> — {reasonText}.
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Based on your saved home location and tracked allergens.
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss alert"
          className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}