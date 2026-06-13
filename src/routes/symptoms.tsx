import { createFileRoute } from "@tanstack/react-router";
import { SymptomLog } from "@/components/SymptomLog";

export const Route = createFileRoute("/symptoms")({
  head: () => ({
    meta: [
      { title: "Symptom log — PollenPath" },
      {
        name: "description",
        content:
          "Log your allergy symptoms day-to-day and see them next to your pollen exposure.",
      },
    ],
  }),
  component: SymptomsScreen,
});

function SymptomsScreen() {
  return (
    <div className="flex min-h-screen flex-col pb-24">
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Symptom log
        </h1>
        <p className="text-sm text-muted-foreground">
          Track how you feel day-to-day to spot pollen patterns.
        </p>
      </header>
      <section className="px-4">
        <SymptomLog />
      </section>
    </div>
  );
}