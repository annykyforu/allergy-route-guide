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

async function pollenAt(lat: number, lng: number): Promise<number> {
  // Returns max UPI across pollen types right now (0..5) using Open-Meteo.
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      current:
        "alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen",
    });
    const res = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`,
    );
    if (!res.ok) return 0;
    const json = (await res.json()) as {
      current?: Record<string, number | null | string>;
    };
    const c = json.current ?? {};
    const vals = [
      c.alder_pollen,
      c.birch_pollen,
      c.olive_pollen,
      c.grass_pollen,
      c.mugwort_pollen,
      c.ragweed_pollen,
    ].map((v) => (typeof v === "number" ? v : 0));
    const peak = Math.max(0, ...vals);
    if (peak <= 0) return 0;
    if (peak < 5) return 1;
    if (peak < 20) return 2;
    if (peak < 50) return 3;
    if (peak < 100) return 4;
    return 5;
  } catch {
    return 0;
  }
}

export interface SafeRoute {
  index: number;
  distanceMeters: number;
  durationSeconds: number;
  polyline: string;
  decodedPath: Array<{ lat: number; lng: number }>;
  averagePollen: number;
  maxPollen: number;
  samples: Array<{ lat: number; lng: number; pollen: number }>;
  safest: boolean;
}

export const findSafeRoutes = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      origin: z.object({ lat: z.number(), lng: z.number() }),
      destination: z.object({ lat: z.number(), lng: z.number() }),
      travelMode: z
        .enum(["WALK", "BICYCLE", "DRIVE", "TRANSIT"])
        .default("WALK"),
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
      // Sample up to 5 points along the path.
      const sampleCount = Math.min(5, path.length);
      const sampleIdx = Array.from({ length: sampleCount }, (_, k) =>
        Math.floor((k + 0.5) * (path.length / sampleCount)),
      );
      const samplePoints = sampleIdx.map((idx) => path[idx]).filter(Boolean);
      const sampled = await Promise.all(
        samplePoints.map(async (p) => ({
          lat: p.lat,
          lng: p.lng,
          pollen: await pollenAt(p.lat, p.lng),
        })),
      );
      const avg = sampled.length
        ? sampled.reduce((s, x) => s + x.pollen, 0) / sampled.length
        : 0;
      const max = sampled.reduce((s, x) => Math.max(s, x.pollen), 0);
      enriched.push({
        index: i,
        distanceMeters: r.distanceMeters ?? 0,
        durationSeconds: parseInt((r.duration ?? "0s").replace("s", ""), 10),
        polyline: encoded,
        decodedPath: path,
        averagePollen: avg,
        maxPollen: max,
        samples: sampled,
        safest: false,
      });
    }
    // Mark the safest (lowest average pollen).
    enriched.sort((a, b) => a.averagePollen - b.averagePollen);
    if (enriched.length) enriched[0].safest = true;
    // Re-sort by original order for stable rendering.
    enriched.sort((a, b) => a.index - b.index);
    return { routes: enriched };
  });