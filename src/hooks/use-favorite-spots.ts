import { useCallback, useEffect, useState } from "react";
import type { SpotCategory } from "@/lib/pollen.functions";

export interface FavoriteSpot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: SpotCategory;
  address?: string;
}

const STORAGE_KEY = "pollenpath.favorites";

function read(): FavoriteSpot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is FavoriteSpot =>
        x &&
        typeof x.id === "string" &&
        typeof x.name === "string" &&
        typeof x.lat === "number" &&
        typeof x.lng === "number" &&
        (x.category === "PARK" || x.category === "SPORTS"),
    );
  } catch {
    return [];
  }
}

function write(list: FavoriteSpot[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  } catch {}
}

export function useFavoriteSpots() {
  const [favorites, setFavorites] = useState<FavoriteSpot[]>([]);

  useEffect(() => {
    setFavorites(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setFavorites(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isFavorite = useCallback(
    (id: string) => favorites.some((f) => f.id === id),
    [favorites],
  );

  const toggle = useCallback((spot: FavoriteSpot) => {
    setFavorites((prev) => {
      const has = prev.some((f) => f.id === spot.id);
      const next = has
        ? prev.filter((f) => f.id !== spot.id)
        : [...prev, spot];
      write(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.filter((f) => f.id !== id);
      write(next);
      return next;
    });
  }, []);

  return { favorites, isFavorite, toggle, remove };
}