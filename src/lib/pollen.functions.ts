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
    return { label };
  });