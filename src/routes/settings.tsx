import { createFileRoute } from "@tanstack/react-router";
import { Check, Leaf } from "lucide-react";
import { ALLERGY_OPTIONS, useAllergies } from "@/hooks/use-allergies";

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
  const { allergies, toggle } = useAllergies();

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
          My allergies
        </h2>
        <ul className="space-y-2">
          {ALLERGY_OPTIONS.map(({ id, label, description }) => {
            const active = allergies.includes(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => toggle(id)}
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
        <p className="mt-3 text-xs text-muted-foreground">
          Your selection is saved on this device.
        </p>
      </section>
    </div>
  );
}