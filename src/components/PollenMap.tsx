import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, type PollenLayer } from "@/lib/google-maps-loader";

interface PollenMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  layer: PollenLayer;
  onMapClick?: (lat: number, lng: number) => void;
  marker?: { lat: number; lng: number } | null;
  polylines?: Array<{
    path: Array<{ lat: number; lng: number }>;
    color: string;
    weight?: number;
    opacity?: number;
  }>;
}

export function PollenMap({
  center = { lat: 40.7128, lng: -74.006 },
  zoom = 12,
  layer,
  onMapClick,
  marker,
  polylines,
}: PollenMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlayRef = useRef<google.maps.ImageMapType | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const polylineRefs = useRef<google.maps.Polyline[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Init map
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !containerRef.current) return;
        const map = new g.maps.Map(containerRef.current, {
          center,
          zoom,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          styles: [
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
          ],
        });
        mapRef.current = map;
        if (onMapClick) {
          map.addListener("click", (e: google.maps.MapMouseEvent) => {
            if (e.latLng) onMapClick(e.latLng.lat(), e.latLng.lng());
          });
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle pollen layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    if (overlayRef.current) {
      const idx = map.overlayMapTypes
        .getArray()
        .indexOf(overlayRef.current as unknown as google.maps.MapType);
      if (idx >= 0) map.overlayMapTypes.removeAt(idx);
      overlayRef.current = null;
    }
    if (layer !== "NONE") {
      const overlay = new google.maps.ImageMapType({
        name: layer,
        tileSize: new google.maps.Size(256, 256),
        opacity: 0.55,
        getTileUrl: (coord, z) =>
          `/api/pollen-tile/${layer}/${z}/${coord.x}/${coord.y}`,
      });
      overlayRef.current = overlay;
      map.overlayMapTypes.push(overlay);
    }
  }, [layer]);

  // Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
    if (marker) {
      markerRef.current = new google.maps.Marker({
        position: marker,
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: "#D97706",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
    }
  }, [marker]);

  // Polylines
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    polylineRefs.current.forEach((p) => p.setMap(null));
    polylineRefs.current = [];
    if (!polylines) return;
    polylines.forEach((pl) => {
      const line = new google.maps.Polyline({
        path: pl.path,
        map,
        strokeColor: pl.color,
        strokeWeight: pl.weight ?? 5,
        strokeOpacity: pl.opacity ?? 0.9,
      });
      polylineRefs.current.push(line);
    });
    // Fit bounds if any
    if (polylines.length) {
      const bounds = new google.maps.LatLngBounds();
      polylines.forEach((pl) => pl.path.forEach((p) => bounds.extend(p)));
      if (!bounds.isEmpty()) map.fitBounds(bounds, 60);
    }
  }, [polylines]);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted p-4 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }
  return <div ref={containerRef} className="h-full w-full" />;
}