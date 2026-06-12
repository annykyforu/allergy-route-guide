import { useEffect, useState, useCallback } from "react";

export type AllergyCategory = "TREE" | "GRASS" | "WEED";

export interface AllergyProfile {
  categories: AllergyCategory[];
  plants: string[];
}

export const CATEGORY_OPTIONS: Array<{
  id: AllergyCategory;
  label: string;
  description: string;
}> = [
  { id: "TREE", label: "Tree pollen", description: "Birch, oak, alder, hazel and other trees." },
  { id: "GRASS", label: "Grass pollen", description: "Timothy, ryegrass and other grasses." },
  { id: "WEED", label: "Weed pollen", description: "Ragweed, mugwort, nettle and similar weeds." },
];

// Google Pollen `plantInfo.code` values, grouped by category.
export const PLANTS_BY_CATEGORY: Record<
  AllergyCategory,
  Array<{ code: string; label: string }>
> = {
  TREE: [
    { code: "ALDER", label: "Alder" },
    { code: "ASH", label: "Ash" },
    { code: "BIRCH", label: "Birch" },
    { code: "COTTONWOOD", label: "Cottonwood" },
    { code: "CYPRESS_PINE", label: "Cypress / Pine" },
    { code: "ELM", label: "Elm" },
    { code: "HAZEL", label: "Hazel" },
    { code: "JUNIPER", label: "Juniper" },
    { code: "MAPLE", label: "Maple" },
    { code: "OAK", label: "Oak" },
    { code: "OLIVE", label: "Olive" },
  ],
  GRASS: [{ code: "GRAMINALES", label: "Grasses (Graminales)" }],
  WEED: [
    { code: "RAGWEED", label: "Ragweed" },
    { code: "MUGWORT", label: "Mugwort" },
  ],
};

export const PLANT_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(PLANTS_BY_CATEGORY)
    .flat()
    .map((p) => [p.code, p.label]),
);

const STORAGE_KEY = "pollenpath.allergies";
const DEFAULT: AllergyProfile = {
  categories: ["TREE", "GRASS", "WEED"],
  plants: [],
};

function read(): AllergyProfile {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    // Migrate old flat array shape.
    if (Array.isArray(parsed)) {
      const categories = parsed.filter(
        (x): x is AllergyCategory =>
          x === "TREE" || x === "GRASS" || x === "WEED",
      );
      return { categories, plants: [] };
    }
    if (parsed && typeof parsed === "object") {
      const categories = Array.isArray(parsed.categories)
        ? parsed.categories.filter(
            (x: unknown): x is AllergyCategory =>
              x === "TREE" || x === "GRASS" || x === "WEED",
          )
        : [];
      const plants = Array.isArray(parsed.plants)
        ? parsed.plants.filter(
            (x: unknown): x is string =>
              typeof x === "string" && x in PLANT_LABEL,
          )
        : [];
      return { categories, plants };
    }
    return DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function write(profile: AllergyProfile) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {}
}

function plantCategory(code: string): AllergyCategory | null {
  for (const cat of Object.keys(PLANTS_BY_CATEGORY) as AllergyCategory[]) {
    if (PLANTS_BY_CATEGORY[cat].some((p) => p.code === code)) return cat;
  }
  return null;
}

export function useAllergies() {
  const [profile, setProfile] = useState<AllergyProfile>(DEFAULT);

  useEffect(() => {
    setProfile(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setProfile(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggleCategory = useCallback((id: AllergyCategory) => {
    setProfile((prev) => {
      const has = prev.categories.includes(id);
      const next: AllergyProfile = {
        categories: has
          ? prev.categories.filter((x) => x !== id)
          : [...prev.categories, id],
        // Removing a category also clears its plants.
        plants: has
          ? prev.plants.filter((p) => plantCategory(p) !== id)
          : prev.plants,
      };
      write(next);
      return next;
    });
  }, []);

  const togglePlant = useCallback((code: string) => {
    setProfile((prev) => {
      const has = prev.plants.includes(code);
      const parent = plantCategory(code);
      const nextPlants = has
        ? prev.plants.filter((x) => x !== code)
        : [...prev.plants, code];
      // Adding a plant auto-enables its category.
      const nextCategories =
        !has && parent && !prev.categories.includes(parent)
          ? [...prev.categories, parent]
          : prev.categories;
      const next = { categories: nextCategories, plants: nextPlants };
      write(next);
      return next;
    });
  }, []);

  return {
    profile,
    categories: profile.categories,
    plants: profile.plants,
    toggleCategory,
    togglePlant,
    hasCategory: (id: AllergyCategory) => profile.categories.includes(id),
    hasPlant: (code: string) => profile.plants.includes(code),
  };
}