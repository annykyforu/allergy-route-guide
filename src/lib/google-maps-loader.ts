// Loads Google Maps JS API once on the client.
let promise: Promise<typeof google> | null = null;

declare global {
  interface Window {
    __initGoogleMaps?: () => void;
  }
}

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps requires the browser"));
  }
  if (promise) return promise;
  if (window.google?.maps) return Promise.resolve(window.google);

  promise = new Promise((resolve, reject) => {
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
    if (!key) {
      reject(new Error("Missing Google Maps browser key"));
      return;
    }
    window.__initGoogleMaps = () => resolve(window.google);
    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${key}` +
      `&loading=async&callback=__initGoogleMaps` +
      `&libraries=geometry,places` +
      (channel ? `&channel=${channel}` : "");
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return promise;
}

export type PollenLayer = "TREE_UPI" | "GRASS_UPI" | "WEED_UPI" | "NONE";

export function pollenColor(value: number): string {
  if (value <= 0) return "var(--pollen-0)";
  if (value === 1) return "var(--pollen-1)";
  if (value === 2) return "var(--pollen-2)";
  if (value === 3) return "var(--pollen-3)";
  if (value === 4) return "var(--pollen-4)";
  return "var(--pollen-5)";
}

export function pollenLabel(value: number): string {
  if (value <= 0) return "None";
  if (value === 1) return "Very Low";
  if (value === 2) return "Low";
  if (value === 3) return "Moderate";
  if (value === 4) return "High";
  return "Very High";
}