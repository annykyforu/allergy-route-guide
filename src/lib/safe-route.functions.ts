import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

function headers(extra: Record<string, string> = {}) {
  const lovable = process.env.LOVABLE_API_KEY;
  const gmaps = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovable || !gmaps) throw new Error("Missing Google Maps credentials");
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": gmaps,
    "Content-Type": "application/json",
    ...extra,
  };
}

// Decode an encoded Google polyline into lat/lng pairs.
function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0,
    lat = 0,
    lng = 0;
  while (index < encoded.length) {
    let b: number,
      shift = 0,
      result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

type PollenLookup = {
  dailyInfo?: Array<{
    date?: { year: number; month: number; day: number };
    pollenTypeInfo?: Array<{
      code?: string;
      indexInfo?: { value?: number };
    }>;
    plantInfo?: Array<{
      code?: string;
      displayName?: string;
      inSeason?: boolean;
      indexInfo?: { value?: number };
    }>;
  }>;
};

const CATEGORY_FOR_PLANT: Record<string, "TREE" | "GRASS" | "WEED"> = {
  ALDER: "TREE", ASH: "TREE", BIRCH: "TREE", COTTONWOOD: "TREE",
  CYPRESS_PINE: "TREE", ELM: "TREE", HAZEL: "TREE", JUNIPER: "TREE",
  MAPLE: "TREE", OAK: "TREE", OLIVE: "TREE",
  GRAMINALES: "GRASS",
  RAGWEED: "WEED", MUGWORT: "WEED",
};

export interface PollenSample {
  lat: number;
  lng: number;
  // Max UPI across all pollen types (legacy summary).
  pollen: number;
  categoryScores: { TREE: number; GRASS: number; WEED: number };
  plantScores: Record<string, { value: number; inSeason: boolean }>;
  // Score using only the user's allergy profile.
  personalized: number;
  // Human-readable top contributor at this sample (e.g. "Birch").
  worstContributor: string | null;
}

async function pollenAt(lat: number, lng: number): Promise<PollenSample> {
  const empty: PollenSample = {
    lat,
    lng,
    pollen: 0,
    categoryScores: { TREE: 0, GRASS: 0, WEED: 0 },
    plantScores: {},
    personalized: 0,
    worstContributor: null,
  };
  try {
    const params = new URLSearchParams({
      "location.latitude": String(lat),
      "location.longitude": String(lng),
      days: "1",
      plantsDescription: "false",
    });
    const res = await fetch(
      `${GATEWAY_URL}/pollen/v1/forecast:lookup?${params.toString()}`,
      { headers: headers() },
    );
    if (!res.ok) return empty;
    const json = (await res.json()) as PollenLookup;
    const today = json.dailyInfo?.[0];
    if (!today) return empty;
    const categoryScores = { TREE: 0, GRASS: 0, WEED: 0 };
    for (const t of today.pollenTypeInfo ?? []) {
      const code = (t.code ?? "").toUpperCase();
      const v = t.indexInfo?.value ?? 0;
      if (code === "TREE" || code === "GRASS" || code === "WEED") {
        categoryScores[code] = v;
      }
    }
    const plantScores: Record<string, { value: number; inSeason: boolean }> = {};
    for (const p of today.plantInfo ?? []) {
      const code = (p.code ?? "").toUpperCase();
      const v = p.indexInfo?.value ?? 0;
      if (!code || v <= 0) continue;
      plantScores[code] = { value: v, inSeason: p.inSeason ?? false };
    }
    const maxCat = Math.max(
      categoryScores.TREE,
      categoryScores.GRASS,
      categoryScores.WEED,
    );
    return {
      lat,
      lng,
      pollen: maxCat,
      categoryScores,
      plantScores,
      // personalized/worstContributor filled in by caller using profile
      personalized: maxCat,
      worstContributor: null,
    };
  } catch {
    return empty;
  }
}

const PLANT_LABEL: Record<string, string> = {
  ALDER: "Alder", ASH: "Ash", BIRCH: "Birch", COTTONWOOD: "Cottonwood",
  CYPRESS_PINE: "Cypress / Pine", ELM: "Elm", HAZEL: "Hazel",
  JUNIPER: "Juniper", MAPLE: "Maple", OAK: "Oak", OLIVE: "Olive",
  GRAMINALES: "Grass", RAGWEED: "Ragweed", MUGWORT: "Mugwort",
};

function personalize(
  sample: PollenSample,
  profile: { categories: string[]; plants: string[] },
): PollenSample {
  const cats = new Set(profile.categories);
  const plants = new Set(profile.plants);
  let best = 0;
  let bestLabel: string | null = null;

  // Score against selected specific plants.
  for (const code of plants) {
    const ps = sample.plantScores[code];
    if (ps && ps.value > best) {
      best = ps.value;
      bestLabel = PLANT_LABEL[code] ?? code;
    }
  }
  // Also include selected categories (covers cases where no plant is selected
  // for that category, or plantInfo missing).
  for (const cat of cats) {
    const v =
      cat === "TREE"
        ? sample.categoryScores.TREE
        : cat === "GRASS"
          ? sample.categoryScores.GRASS
          : cat === "WEED"
            ? sample.categoryScores.WEED
            : 0;
    if (v > best) {
      best = v;
      // Try to attribute to the worst plant in that category if available.
      const topPlant = Object.entries(sample.plantScores)
        .filter(([code]) => CATEGORY_FOR_PLANT[code] === cat)
        .sort((a, b) => b[1].value - a[1].value)[0];
      bestLabel = topPlant
        ? (PLANT_LABEL[topPlant[0]] ?? topPlant[0])
        : cat === "TREE"
          ? "Tree pollen"
          : cat === "GRASS"
            ? "Grass pollen"
            : "Weed pollen";
    }
  }
  // No profile selected — fall back to overall max.
  if (cats.size === 0 && plants.size === 0) {
    best = sample.pollen;
    const topPlant = Object.entries(sample.plantScores).sort(
      (a, b) => b[1].value - a[1].value,
    )[0];
    bestLabel = topPlant ? (PLANT_LABEL[topPlant[0]] ?? topPlant[0]) : null;
  }
  return { ...sample, personalized: best, worstContributor: bestLabel };
}

export interface SafeRoute {
  index: number;
  distanceMeters: number;
  durationSeconds: number;
  polyline: string;
  decodedPath: Array<{ lat: number; lng: number }>;
  averagePollen: number;
  maxPollen: number;
  personalizedAvg: number;
  personalizedMax: number;
  worstPlant: string | null;
  samples: PollenSample[];
  safest: boolean;
}

const profileSchema = z.object({
  categories: z.array(z.enum(["TREE", "GRASS", "WEED"])).default([]),
  plants: z.array(z.string().max(40)).default([]),
});

export const findSafeRoutes = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      origin: z.object({ lat: z.number(), lng: z.number() }),
      destination: z.object({ lat: z.number(), lng: z.number() }),
      travelMode: z
        .enum(["WALK", "BICYCLE", "DRIVE", "TRANSIT"])
        .default("WALK"),
      allergyProfile: profileSchema.default({ categories: [], plants: [] }),
    }),
  )
  .handler(async ({ data }) => {
    const body = {
      origin: {
        location: {
          latLng: { latitude: data.origin.lat, longitude: data.origin.lng },
        },
      },
      destination: {
        location: {
          latLng: {
            latitude: data.destination.lat,
            longitude: data.destination.lng,
          },
        },
      },
      travelMode: data.travelMode,
      computeAlternativeRoutes: true,
      polylineQuality: "OVERVIEW",
      languageCode: "en-US",
      units: "METRIC",
    };

    const res = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: headers({
        "X-Goog-FieldMask":
          "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Routes API ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      routes?: Array<{
        distanceMeters?: number;
        duration?: string;
        polyline?: { encodedPolyline?: string };
      }>;
    };
    const routes = json.routes ?? [];
    if (!routes.length) throw new Error("No routes found");

    const enriched: SafeRoute[] = [];
    for (let i = 0; i < routes.length; i++) {
      const r = routes[i];
      const encoded = r.polyline?.encodedPolyline ?? "";
      const path = encoded ? decodePolyline(encoded) : [];
      // Sample up to 12 points along the path for segment-level coloring.
      const sampleCount = Math.min(12, Math.max(2, path.length));
      const sampleIdx = Array.from({ length: sampleCount }, (_, k) =>
        Math.floor((k + 0.5) * (path.length / sampleCount)),
      );
      const samplePoints = sampleIdx
        .map((idx) => path[idx])
        .filter((p): p is { lat: number; lng: number } => Boolean(p));
      const rawSamples = await Promise.all(
        samplePoints.map((p) => pollenAt(p.lat, p.lng)),
      );
      const sampled = rawSamples.map((s) =>
        personalize(s, data.allergyProfile),
      );
      const avg = sampled.length
        ? sampled.reduce((s, x) => s + x.pollen, 0) / sampled.length
        : 0;
      const max = sampled.reduce((s, x) => Math.max(s, x.pollen), 0);
      const pAvg = sampled.length
        ? sampled.reduce((s, x) => s + x.personalized, 0) / sampled.length
        : 0;
      const pMax = sampled.reduce((s, x) => Math.max(s, x.personalized), 0);
      // Most frequent worst contributor across samples.
      const tally = new Map<string, number>();
      for (const s of sampled) {
        if (s.worstContributor) {
          tally.set(
            s.worstContributor,
            (tally.get(s.worstContributor) ?? 0) + 1,
          );
        }
      }
      const worstPlant =
        Array.from(tally.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
        null;
      enriched.push({
        index: i,
        distanceMeters: r.distanceMeters ?? 0,
        durationSeconds: parseInt((r.duration ?? "0s").replace("s", ""), 10),
        polyline: encoded,
        decodedPath: path,
        averagePollen: avg,
        maxPollen: max,
        personalizedAvg: pAvg,
        personalizedMax: pMax,
        worstPlant,
        samples: sampled,
        safest: false,
      });
    }
    // Mark the safest only if it is meaningfully lower than the others.
    // The pollen API has coarse spatial resolution, so nearby routes often
    // share identical scores; in that case no route is genuinely "safer".
    if (enriched.length > 1) {
      const sorted = [...enriched].sort(
        (a, b) => a.personalizedAvg - b.personalizedAvg,
      );
      const best = sorted[0];
      const next = sorted[1];
      const meaningfullyLower =
        next.personalizedAvg - best.personalizedAvg >= 0.25 ||
        best.personalizedMax < next.personalizedMax;
      if (meaningfullyLower) {
        enriched.find((r) => r.index === best.index)!.safest = true;
      }
    } else if (enriched.length === 1) {
      enriched[0].safest = true;
    }
    return { routes: enriched };
  });

// 5-day personalized exposure forecast at a single point (e.g. route midpoint).
export interface ExposureDay {
  date: string; // YYYY-MM-DD
  personalized: number;
  worstContributor: string | null;
  categoryScores: { TREE: number; GRASS: number; WEED: number };
}

export const getRouteExposureForecast = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      allergyProfile: profileSchema.default({ categories: [], plants: [] }),
    }),
  )
  .handler(async ({ data }) => {
    const params = new URLSearchParams({
      "location.latitude": String(data.lat),
      "location.longitude": String(data.lng),
      days: "5",
      plantsDescription: "false",
    });
    const res = await fetch(
      `${GATEWAY_URL}/pollen/v1/forecast:lookup?${params.toString()}`,
      { headers: headers() },
    );
    if (!res.ok) return { days: [] as ExposureDay[] };
    const json = (await res.json()) as PollenLookup;
    const days: ExposureDay[] = (json.dailyInfo ?? []).map((d) => {
      const categoryScores = { TREE: 0, GRASS: 0, WEED: 0 };
      for (const t of d.pollenTypeInfo ?? []) {
        const code = (t.code ?? "").toUpperCase();
        const v = t.indexInfo?.value ?? 0;
        if (code === "TREE" || code === "GRASS" || code === "WEED") {
          categoryScores[code] = v;
        }
      }
      const plantScores: Record<string, { value: number; inSeason: boolean }> =
        {};
      for (const p of d.plantInfo ?? []) {
        const code = (p.code ?? "").toUpperCase();
        const v = p.indexInfo?.value ?? 0;
        if (!code || v <= 0) continue;
        plantScores[code] = { value: v, inSeason: p.inSeason ?? false };
      }
      const sample: PollenSample = {
        lat: data.lat,
        lng: data.lng,
        pollen: Math.max(
          categoryScores.TREE,
          categoryScores.GRASS,
          categoryScores.WEED,
        ),
        categoryScores,
        plantScores,
        personalized: 0,
        worstContributor: null,
      };
      const scored = personalize(sample, data.allergyProfile);
      const dt = d.date;
      const dateStr = dt
        ? `${dt.year}-${String(dt.month).padStart(2, "0")}-${String(dt.day).padStart(2, "0")}`
        : "";
      return {
        date: dateStr,
        personalized: scored.personalized,
        worstContributor: scored.worstContributor,
        categoryScores,
      };
    });
    return { days };
  });