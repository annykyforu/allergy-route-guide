import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Check, Leaf, NotebookPen, ChevronRight, Home, X } from "lucide-react";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { geocodeAddress } from "@/lib/pollen.functions";
import { useHomeLocation } from "@/hooks/use-home-location";
import {
  CATEGORY_OPTIONS,
  PLANTS_BY_CATEGORY,
  useAllergies,
  type AllergyCategory,
} from "@/hooks/use-allergies";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — PollenPath" },
      {
        name: "description",
        content: "Choose which pollen allergies PollenPath should track for you.",
      },
      { property: "og:title", content: "Settings — PollenPath" },
      {
        property: "og:description",
        content: "Personalize your pollen alerts by selecting your allergy types.",
      },
    ],
  }),
  component: SettingsScreen,
});

function SettingsScreen() {
  const {
    categories,
    plants,
    toggleCategory,
    togglePlant,
  } = useAllergies();
  const { home, save: saveHome, clear: clearHome } = useHomeLocation();
  const [homeInput, setHomeInput] = useState("");
  const geocode = useServerFn(geocodeAddress);
  const saveMutation = useMutation({
    mutationFn: (address: string) => geocode({ data: { address } }),
    onSuccess: (res) => {
      saveHome({ lat: res.lat, lng: res.lng, label: res.address });
      setHomeInput("");
    },
  });

  return (
    <div className="flex min-h-screen flex-col pb-24">
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Tell us what you react to so we can tailor the map and forecast.
        </p>
      </header>

      <section className="px-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Home location
        </h2>
        <p className="mb-2 text-xs text-muted-foreground">
          We'll watch this spot and alert you when a pollen spike is forecast
          in the next few days.
        </p>
        {home ? (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[image:var(--gradient-warn)] text-primary-foreground">
              <Home className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {home.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {home.lat.toFixed(3)}, {home.lng.toFixed(3)}
              </p>
            </div>
            <button
              onClick={clearHome}
              aria-label="Remove home location"
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = homeInput.trim();
              if (v) saveMutation.mutate(v);
            }}
            className="mb-6 space-y-2"
          >
            <input
              type="text"
              value={homeInput}
              onChange={(e) => setHomeInput(e.target.value)}
              placeholder="e.g. Vienna, Austria"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saveMutation.isPending || !homeInput.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[image:var(--gradient-warn)] px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                <Home className="h-3.5 w-3.5" />
                {saveMutation.isPending ? "Saving…" : "Save home"}
              </button>
              {saveMutation.isError && (
                <span className="text-xs text-destructive">
                  Couldn't find that place.
                </span>
              )}
            </div>
          </form>
        )}

        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Categories
        </h2>
        <ul className="space-y-2">
          {CATEGORY_OPTIONS.map(({ id, label, description }) => {
            const active = categories.includes(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => toggleCategory(id)}
                  aria-pressed={active}
                  className={
                    "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors " +
                    (active
                      ? "border-primary bg-accent"
                      : "border-border bg-card hover:border-foreground/30")
                  }
                >
                  <span
                    className={
                      "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl " +
                      (active
                        ? "bg-[image:var(--gradient-warn)] text-primary-foreground"
                        : "bg-muted text-muted-foreground")
                    }
                  >
                    <Leaf className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">
                      {label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {description}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={
                      "grid h-6 w-6 shrink-0 place-items-center rounded-full border " +
                      (active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background")
                    }
                  >
                    {active && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <h2 className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Specific plants
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Pick the exact plants you react to. Route risk is computed against
          these — e.g. a birch-only profile ignores high grass days.
        </p>
        <div className="space-y-4">
          {(Object.keys(PLANTS_BY_CATEGORY) as AllergyCategory[]).map((cat) => {
            const catLabel = CATEGORY_OPTIONS.find((c) => c.id === cat)?.label ?? cat;
            return (
              <div key={cat}>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {catLabel}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {PLANTS_BY_CATEGORY[cat].map(({ code, label }) => {
                    const active = plants.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => togglePlant(code)}
                        aria-pressed={active}
                        className={
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                          (active
                            ? "border-primary bg-accent text-foreground"
                            : "border-border bg-card text-muted-foreground hover:text-foreground")
                        }
                      >
                        {active && <Check className="h-3 w-3" />}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Your selection is saved on this device.
        </p>

        <h2 className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          More
        </h2>
        <Link
          to="/symptoms"
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/30"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <NotebookPen className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              Symptom log
            </span>
            <span className="block text-xs text-muted-foreground">
              Track how you feel day-to-day.
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      </section>
    </div>
  );
}