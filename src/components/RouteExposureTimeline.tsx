import { pollenColor, pollenLabel } from "@/lib/google-maps-loader";
import type { ExposureDay } from "@/lib/safe-route.functions";

function dayShort(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function dayNum(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return String(d.getDate());
}

export function RouteExposureTimeline({
  days,
  loading,
}: {
  days: ExposureDay[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
        Loading 5-day exposure forecast…
      </div>
    );
  }
  if (!days.length) return null;
  const best = [...days].sort((a, b) => a.personalized - b.personalized)[0];
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          5-day exposure
        </h3>
        <span className="text-[11px] text-muted-foreground">
          at route midpoint
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Personalized to your allergies. Google Pollen forecasts at daily
        resolution.
      </p>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {days.map((d) => {
          const isBest = d.date === best.date;
          return (
            <div key={d.date} className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {dayShort(d.date)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {dayNum(d.date)}
              </span>
              <div
                className={
                  "flex h-10 w-full items-center justify-center rounded-lg text-xs font-semibold text-white " +
                  (isBest ? "ring-2 ring-offset-2 ring-offset-card ring-foreground" : "")
                }
                style={{ background: pollenColor(Math.round(d.personalized)) }}
                aria-label={`${pollenLabel(Math.round(d.personalized))} on ${d.date}`}
              >
                {d.personalized.toFixed(0)}
              </div>
              <span className="block max-w-full truncate text-[10px] text-muted-foreground">
                {d.worstContributor ?? "—"}
              </span>
            </div>
          );
        })}
      </div>
      {best && (
        <p className="mt-3 text-xs text-foreground">
          Best day to travel:{" "}
          <strong>{dayShort(best.date)}</strong> ·{" "}
          {pollenLabel(Math.round(best.personalized))} ({best.personalized.toFixed(1)}
          /5)
        </p>
      )}
    </div>
  );
}