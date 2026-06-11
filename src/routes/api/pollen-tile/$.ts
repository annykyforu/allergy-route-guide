import { createFileRoute } from "@tanstack/react-router";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const ALLOWED = new Set(["TREE_UPI", "GRASS_UPI", "WEED_UPI"]);

// Proxies Google Pollen heatmap tiles through the connector gateway.
// URL pattern: /api/pollen-tile/<TYPE>/<z>/<x>/<y>
export const Route = createFileRoute("/api/pollen-tile/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const splat = (params as { _splat?: string })._splat ?? "";
        const parts = splat.split("/");
        if (parts.length !== 4) {
          return new Response("Bad path", { status: 400 });
        }
        const [type, z, x, y] = parts;
        if (!ALLOWED.has(type) || ![z, x, y].every((p) => /^\d+$/.test(p))) {
          return new Response("Bad params", { status: 400 });
        }
        const lovable = process.env.LOVABLE_API_KEY;
        const gmaps = process.env.GOOGLE_MAPS_API_KEY;
        if (!lovable || !gmaps) {
          return new Response("Server not configured", { status: 500 });
        }
        const upstream = await fetch(
          `${GATEWAY_URL}/pollen/v1/mapTypes/${type}/heatmapTiles/${z}/${x}/${y}`,
          {
            headers: {
              Authorization: `Bearer ${lovable}`,
              "X-Connection-Api-Key": gmaps,
            },
          },
        );
        if (!upstream.ok) {
          return new Response(null, { status: upstream.status });
        }
        const buf = await upstream.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type":
              upstream.headers.get("content-type") ?? "image/png",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});