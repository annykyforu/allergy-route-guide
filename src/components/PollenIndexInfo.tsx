import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { pollenHex, pollenLabel } from "@/lib/google-maps-loader";

const LEVELS: Array<{ value: number; recommendation: string }> = [
  { value: 0, recommendation: "No pollen detected." },
  { value: 1, recommendation: "Unlikely to affect most people." },
  { value: 2, recommendation: "Mild symptoms possible for sensitive people." },
  { value: 3, recommendation: "Allergy sufferers may notice symptoms." },
  { value: 4, recommendation: "Strong reactions likely; limit outdoor time." },
  { value: 5, recommendation: "Avoid outdoor exposure if you can." },
];

interface PollenIndexInfoProps {
  className?: string;
  ariaLabel?: string;
}

export function PollenIndexInfo({
  className,
  ariaLabel = "About the pollen index",
}: PollenIndexInfoProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={
            "inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring " +
            (className ?? "")
          }
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 max-w-[calc(100vw-1.5rem)] p-4 text-sm"
      >
        <h3 className="text-sm font-semibold text-foreground">
          What is the pollen index?
        </h3>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          A 0–5 scale (Google's Universal Pollen Index) showing how much pollen
          is in the air and how likely it is to trigger symptoms. Higher
          numbers mean stronger exposure and a higher chance of allergy
          reactions.
        </p>
        <ul className="mt-3 space-y-1.5">
          {LEVELS.map((l) => (
            <li key={l.value} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: pollenHex(l.value) }}
              >
                {l.value}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  {pollenLabel(l.value)}
                </p>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {l.recommendation}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[10px] leading-snug text-muted-foreground">
          Scores are personalized to your allergy profile where possible.
          Source: Google Pollen API.
        </p>
      </PopoverContent>
    </Popover>
  );
}