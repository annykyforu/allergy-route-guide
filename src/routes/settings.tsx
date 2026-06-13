import { createFileRoute } from "@tanstack/react-router";
import { Check, Leaf } from "lucide-react";
import {
  CATEGORY_OPTIONS,
  PLANTS_BY_CATEGORY,
  useAllergies,
  type AllergyCategory,
} from "@/hooks/use-allergies";
import { SymptomLog } from "@/components/SymptomLog";

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
          Symptom log
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Track how you feel day-to-day. Entries sync across your devices.
        </p>
        <SymptomLog />
      </section>
    </div>
  );
}