import { useEffect, useState, useCallback } from "react";

export type AllergyType = "TREE" | "GRASS" | "WEED";

export const ALLERGY_OPTIONS: Array<{
  id: AllergyType;
  label: string;
  description: string;
}> = [
  { id: "TREE", label: "Tree pollen", description: "Birch, oak, alder, hazel and other tree pollen." },
  { id: "GRASS", label: "Grass pollen", description: "Timothy, ryegrass and other grasses." },
  { id: "WEED", label: "Weed pollen", description: "Ragweed, mugwort, nettle and similar weeds." },
];

const STORAGE_KEY = "pollenpath.allergies";
const DEFAULT: AllergyType[] = ["TREE", "GRASS", "WEED"];

function read(): AllergyType[] {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT;
    return parsed.filter((x): x is AllergyType =>
      x === "TREE" || x === "GRASS" || x === "WEED",
    );
  } catch {
    return DEFAULT;
  }
}

export function useAllergies() {
  const [allergies, setAllergies] = useState<AllergyType[]>(DEFAULT);

  useEffect(() => {
    setAllergies(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setAllergies(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback((id: AllergyType) => {
    setAllergies((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return { allergies, toggle, has: (id: AllergyType) => allergies.includes(id) };
}