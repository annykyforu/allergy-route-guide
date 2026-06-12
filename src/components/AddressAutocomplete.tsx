import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps-loader";

type Suggestion = {
  placeId: string;
  text: string;
  secondary?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function AddressAutocomplete({
  value,
  onChange,
  placeholder,
  className,
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null,
  );
  const placesLibRef = useRef<google.maps.PlacesLibrary | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(async (g) => {
      if (cancelled) return;
      const lib = (await g.maps.importLibrary(
        "places",
      )) as google.maps.PlacesLibrary;
      placesLibRef.current = lib;
      sessionTokenRef.current = new lib.AutocompleteSessionToken();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const fetchSuggestions = (input: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const lib = placesLibRef.current;
      if (!lib) return;
      try {
        const { suggestions: res } =
          await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
            sessionToken: sessionTokenRef.current ?? undefined,
          });
        const mapped: Suggestion[] = res
          .map((s) => s.placePrediction)
          .filter((p): p is google.maps.places.PlacePrediction => !!p)
          .map((p) => ({
            placeId: p.placeId,
            text: p.mainText?.toString() ?? p.text.toString(),
            secondary: p.secondaryText?.toString(),
          }));
        setSuggestions(mapped);
        setOpen(mapped.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 200);
  };

  const handleSelect = (s: Suggestion) => {
    const full = s.secondary ? `${s.text}, ${s.secondary}` : s.text;
    onChange(full);
    setSuggestions([]);
    setOpen(false);
    // Refresh session token after a selection (Places billing best practice)
    const lib = placesLibRef.current;
    if (lib) sessionTokenRef.current = new lib.AutocompleteSessionToken();
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          fetchSuggestions(e.target.value);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(s)}
                className="block w-full px-4 py-2 text-left text-sm hover:bg-accent"
              >
                <div className="font-medium text-foreground">{s.text}</div>
                {s.secondary && (
                  <div className="text-xs text-muted-foreground">
                    {s.secondary}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}