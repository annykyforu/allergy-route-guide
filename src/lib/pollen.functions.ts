import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

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
      "location.latitude": String(data.lat),
      "location.longitude": String(data.lng),
      days: String(data.days),
      plantsDescription: "true",
    });
    const res = await fetch(
      `${GATEWAY_URL}/pollen/v1/forecast:lookup?${params.toString()}`,
      { headers: headers() },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Pollen API ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as PollenForecast;
    return json;
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

// Reverse-geocode lat/lng to a short place name (locality if possible).
export const reverseGeocode = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    }),
  )
  .handler(async ({ data }) => {
    const url = `${GATEWAY_URL}/maps/api/geocode/json?latlng=${data.lat},${data.lng}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error(`Reverse geocode failed: ${res.status}`);
    const json = (await res.json()) as {
      results: Array<{
        formatted_address: string;
        address_components: Array<{
          long_name: string;
          short_name: string;
          types: string[];
        }>;
      }>;
      status: string;
    };
    if (json.status !== "OK" || !json.results.length) {
      return { label: `${data.lat.toFixed(3)}, ${data.lng.toFixed(3)}` };
    }
    // Prefer locality + admin area for a friendly label.
    const comps = json.results[0].address_components;
    const pick = (type: string) =>
      comps.find((c) => c.types.includes(type))?.long_name;
    const locality =
      pick("locality") ||
      pick("postal_town") ||
      pick("sublocality") ||
      pick("administrative_area_level_2");
    const region = pick("administrative_area_level_1") || pick("country");
    const label =
      locality && region
        ? `${locality}, ${region}`
        : locality || region || json.results[0].formatted_address;
    return { label, address: json.results[0].formatted_address };
  });

// Best-effort IP-based location using Cloudflare request headers (set by the
// Worker runtime). Falls back to null if unavailable.
export const getIpLocation = createServerFn({ method: "GET" }).handler(
  async () => {
    const lat = parseFloat(getRequestHeader("cf-iplatitude") ?? "");
    const lng = parseFloat(getRequestHeader("cf-iplongitude") ?? "");
    const city = getRequestHeader("cf-ipcity");
    const country = getRequestHeader("cf-ipcountry");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const decoded = city
      ? decodeURIComponent(city.replace(/\+/g, " "))
      : undefined;
    const label =
      decoded && country
        ? `${decoded}, ${country}`
        : decoded || country || `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    return { lat, lng, label };
  },
);

// Find nearby green areas (parks, gardens, cemeteries) using Places API (New).
// Used by the "Green zones" map layer to model intra-city pollen variation:
// parks tend to elevate local pollen vs. dense street grids.
export const getNearbyGreenAreas = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radius: z.number().min(100).max(5000).default(2000),
    }),
  )
  .handler(async ({ data }) => {
    const res = await fetch(`${GATEWAY_URL}/places/v1/places:searchNearby`, {
      method: "POST",
      headers: {
        ...headers(),
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.location,places.types",
      },
      body: JSON.stringify({
        includedTypes: ["park", "garden"],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: data.lat, longitude: data.lng },
            radius: data.radius,
          },
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Places API ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      places?: Array<{
        id: string;
        displayName?: { text: string };
        location?: { latitude: number; longitude: number };
        types?: string[];
      }>;
    };
    return (json.places ?? [])
      .filter((p) => p.location)
      .map((p) => ({
        id: p.id,
        name: p.displayName?.text ?? "Green area",
        lat: p.location!.latitude,
        lng: p.location!.longitude,
      }));
  });

// Find nearby outdoor places suitable for exercise (parks + sports venues),
// then look up today's pollen index for each so users can pick a safer spot
// for an outdoor workout.
export type SpotCategory = "PARK" | "SPORTS";

const PARK_TYPES = ["park", "garden", "national_park"] as const;
const SPORTS_TYPES = [
  "stadium",
  "sports_complex",
  "athletic_field",
  "sports_club",
  "fitness_center",
] as const;

function categorize(types: string[] | undefined): SpotCategory {
  if (!types) return "PARK";
  if (types.some((t) => (SPORTS_TYPES as readonly string[]).includes(t)))
    return "SPORTS";
  return "PARK";
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function fetchTodayMax(lat: number, lng: number): Promise<{
  byType: Record<string, number>;
  max: number;
} | null> {
  const params = new URLSearchParams({
    "location.latitude": String(lat),
    "location.longitude": String(lng),
    days: "1",
  });
  const res = await fetch(
    `${GATEWAY_URL}/pollen/v1/forecast:lookup?${params.toString()}`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as PollenForecast;
  const today = json.dailyInfo?.[0];
  if (!today) return null;
  const byType: Record<string, number> = {};
  for (const t of today.pollenTypeInfo) {
    byType[t.code] = t.indexInfo?.value ?? 0;
  }
  const max = Math.max(0, ...Object.values(byType));
  return { byType, max };
}

export const getSafeOutdoorSpots = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radius: z.number().min(200).max(10000).default(3000),
      categories: z
        .array(z.enum(["PARK", "SPORTS"]))
        .default(["PARK", "SPORTS"]),
    }),
  )
  .handler(async ({ data }) => {
    const includedTypes = [
      ...(data.categories.includes("PARK") ? PARK_TYPES : []),
      ...(data.categories.includes("SPORTS") ? SPORTS_TYPES : []),
    ];
    if (includedTypes.length === 0) return [];

    const placesRes = await fetch(`${GATEWAY_URL}/places/v1/places:searchNearby`, {
      method: "POST",
      headers: {
        ...headers(),
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.location,places.types,places.formattedAddress",
      },
      body: JSON.stringify({
        includedTypes,
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: data.lat, longitude: data.lng },
            radius: data.radius,
          },
        },
      }),
    });
    if (!placesRes.ok) {
      const body = await placesRes.text();
      throw new Error(`Places API ${placesRes.status}: ${body.slice(0, 200)}`);
    }
    const placesJson = (await placesRes.json()) as {
      places?: Array<{
        id: string;
        displayName?: { text: string };
        formattedAddress?: string;
        location?: { latitude: number; longitude: number };
        types?: string[];
      }>;
    };
    const spots = (placesJson.places ?? [])
      .filter((p) => p.location)
      .slice(0, 12)
      .map((p) => ({
        id: p.id,
        name: p.displayName?.text ?? "Outdoor spot",
        address: p.formattedAddress,
        lat: p.location!.latitude,
        lng: p.location!.longitude,
        category: categorize(p.types),
        distanceKm: haversineKm(
          { lat: data.lat, lng: data.lng },
          { lat: p.location!.latitude, lng: p.location!.longitude },
        ),
      }));

    // Fetch today's pollen for each spot in parallel.
    const enriched = await Promise.all(
      spots.map(async (s) => {
        const pollen = await fetchTodayMax(s.lat, s.lng);
        return {
          ...s,
          pollen: pollen?.byType ?? {},
          pollenMax: pollen?.max ?? null,
        };
      }),
    );
    return enriched;
  });