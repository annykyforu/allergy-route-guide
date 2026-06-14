import { useCallback, useEffect, useState } from "react";

export interface HomeLocation {
  lat: number;
  lng: number;
  label: string;
}

const STORAGE_KEY = "pollenpath.home";

function read(): HomeLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.lat === "number" &&
      typeof parsed.lng === "number" &&
      typeof parsed.label === "string"
    ) {
      return parsed as HomeLocation;
    }
    return null;
  } catch {
    return null;
  }
}

export function useHomeLocation() {
  const [home, setHome] = useState<HomeLocation | null>(null);

  useEffect(() => {
    setHome(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setHome(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const save = useCallback((next: HomeLocation) => {
    setHome(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      // Trigger same-tab listeners.
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEY }),
      );
    } catch {}
  }, []);

  const clear = useCallback(() => {
    setHome(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEY }),
      );
    } catch {}
  }, []);

  return { home, save, clear };
}