import { pollenColor, pollenLabel } from "@/lib/google-maps-loader";

export function PollenBadge({ value, label }: { value: number; label?: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 shadow-sm border border-border">
      <span
        aria-hidden
        className="h-3 w-3 rounded-full"
        style={{ background: pollenColor(value) }}
      />
      <span className="text-xs font-medium text-foreground">
        {label ?? pollenLabel(value)} · {value}/5
      </span>
    </div>
  );
}

export function PollenScale() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2, 3, 4, 5].map((v) => (
        <div key={v} className="flex flex-col items-center gap-0.5">
          <div
            className="h-2 w-6 rounded-full"
            style={{ background: pollenColor(v) }}
          />
          <span className="text-[9px] text-muted-foreground">{v}</span>
        </div>
      ))}
    </div>
  );
}