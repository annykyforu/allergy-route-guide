import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const OPEN_METEO_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

// Map grains/m³ concentration to a 0..5 universal pollen index.
function concentrationToUpi(c: number): number {
  if (!Number.isFinite(c) || c <= 0) return 0;
  if (c < 5) return 1;
  if (c < 20) return 2;
  if (c < 50) return 3;
  if (c < 100) return 4;
  return 5;
}

const HEALTH_TIPS: Record<number, string> = {
  0: "No pollen detected. Enjoy the outdoors.",
  1: "Very low pollen. Symptoms unlikely.",
  2: "Low pollen. Sensitive individuals may notice mild symptoms.",
  3: "Moderate pollen. Consider antihistamines if you're sensitive.",
  4: "High pollen. Limit outdoor time and keep windows closed.",
  5: "Very high pollen. Avoid outdoor activity when possible.",
};

function headers() {
  const lovable = process.env.LOVABLE_API_KEY;
  const gmaps = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovable || !gmaps) throw new Error("Missing Google Maps credentials");
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": gmaps,
    "Content-Type": "application/json",
  };
}

export const getPollenForecast = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      days: z.number().min(1).max(5).default(5),
    }),
  )
  .handler(async ({ data }) => {
    const params = new URLSearchParams({
      latitude: String(data.lat),
      longitude: String(data.lng),
      hourly:
        "alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen",
      forecast_days: String(data.days),
      timezone: "auto",
    });
    const res = await fetch(`${OPEN_METEO_URL}?${params.toString()}`);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Open-Meteo ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      hourly: {
        time: string[];
        alder_pollen: Array<number | null>;
        birch_pollen: Array<number | null>;
        grass_pollen: Array<number | null>;
        mugwort_pollen: Array<number | null>;
        olive_pollen: Array<number | null>;
        ragweed_pollen: Array<number | null>;
      };
    };

    // Group hourly readings by local date (YYYY-MM-DD from "time").
    const byDay = new Map<
      string,
      { tree: number; grass: number; weed: number; plants: Record<string, number> }
    >();
    const plantKeys = [
      "alder_pollen",
      "birch_pollen",
      "olive_pollen",
      "grass_pollen",
      "mugwort_pollen",
      "ragweed_pollen",
    ] as const;

    for (let i = 0; i < json.hourly.time.length; i++) {
      const day = json.hourly.time[i].slice(0, 10);
      const bucket =
        byDay.get(day) ??
        { tree: 0, grass: 0, weed: 0, plants: {} as Record<string, number> };
      const alder = json.hourly.alder_pollen[i] ?? 0;
      const birch = json.hourly.birch_pollen[i] ?? 0;
      const olive = json.hourly.olive_pollen[i] ?? 0;
      const grass = json.hourly.grass_pollen[i] ?? 0;
      const mugwort = json.hourly.mugwort_pollen[i] ?? 0;
      const ragweed = json.hourly.ragweed_pollen[i] ?? 0;
      bucket.tree = Math.max(bucket.tree, alder, birch, olive);
      bucket.grass = Math.max(bucket.grass, grass);
      bucket.weed = Math.max(bucket.weed, mugwort, ragweed);
      for (const k of plantKeys) {
        const v = json.hourly[k][i] ?? 0;
        bucket.plants[k] = Math.max(bucket.plants[k] ?? 0, v);
      }
      byDay.set(day, bucket);
    }

    const dailyInfo: PollenForecast["dailyInfo"] = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, data.days)
      .map(([day, b]) => {
        const [y, m, d] = day.split("-").map(Number);
        const buildType = (
          code: string,
          displayName: string,
          concentration: number,
        ) => {
          const v = concentrationToUpi(concentration);
          return {
            code,
            displayName,
            indexInfo: {
              value: v,
              category: ["None", "Very Low", "Low", "Moderate", "High", "Very High"][v],
              indexDescription: `${concentration.toFixed(1)} grains/m³`,
            },
            healthRecommendations: [HEALTH_TIPS[v]],
          };
        };
        const plantLabels: Record<string, string> = {
          alder_pollen: "Alder",
          birch_pollen: "Birch",
          olive_pollen: "Olive",
          grass_pollen: "Grass",
          mugwort_pollen: "Mugwort",
          ragweed_pollen: "Ragweed",
        };
        return {
          date: { year: y, month: m, day: d },
          pollenTypeInfo: [
            buildType("TREE", "Tree", b.tree),
            buildType("GRASS", "Grass", b.grass),
            buildType("WEED", "Weed", b.weed),
          ],
          plantInfo: plantKeys.map((k) => {
            const c = b.plants[k] ?? 0;
            const v = concentrationToUpi(c);
            return {
              code: k.toUpperCase(),
              displayName: plantLabels[k],
              inSeason: c > 0,
              indexInfo: {
                value: v,
                category: ["None", "Very Low", "Low", "Moderate", "High", "Very High"][v],
              },
            };
          }),
        };
      });

    return { regionCode: undefined, dailyInfo } satisfies PollenForecast;
  });

export interface PollenForecast {
  regionCode?: string;
  dailyInfo: Array<{
    date: { year: number; month: number; day: number };
    pollenTypeInfo: Array<{
      code: string;
      displayName?: string;
      indexInfo?: {
        value: number;
        category: string;
        indexDescription?: string;
        color?: { red?: number; green?: number; blue?: number };
      };
      healthRecommendations?: string[];
    }>;
    plantInfo?: Array<{
      code: string;
      displayName?: string;
      inSeason?: boolean;
      indexInfo?: { value: number; category: string };
    }>;
  }>;
}

// Geocode an address to lat/lng
export const geocodeAddress = createServerFn({ method: "POST" })
  .inputValidator(z.object({ address: z.string().min(1).max(300) }))
  .handler(async ({ data }) => {
    const url = `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(data.address)}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
    const json = (await res.json()) as {
      results: Array<{
        formatted_address: string;
        geometry: { location: { lat: number; lng: number } };
      }>;
      status: string;
    };
    if (json.status !== "OK" || !json.results.length) {
      throw new Error(`No results for "${data.address}"`);
    }
    const r = json.results[0];
    return {
      address: r.formatted_address,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
    };
  });