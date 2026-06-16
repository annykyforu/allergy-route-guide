/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, type PollenLayer } from "@/lib/google-maps-loader";

interface PollenMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  layer: PollenLayer;
  onMapClick?: (lat: number, lng: number) => void;
  marker?: { lat: number; lng: number } | null;
  // User's current location — rendered as a distinct blue dot.
  userLocation?: { lat: number; lng: number } | null;
  polylines?: Array<{
    path: Array<{ lat: number; lng: number }>;
    color: string;
    weight?: number;
    opacity?: number;
  }>;
  // Multi-colored route segments, drawn one polyline per pair of points.
  segments?: Array<{
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
    color: string;
    weight?: number;
    opacity?: number;
  }>;
  // Hotspot markers with optional info-window content.
  hotspots?: Array<{
    lat: number;
    lng: number;
    color: string;
    title: string;
    breakdown: string;
  }>;
}

export function PollenMap({
  center = { lat: 48.2082, lng: 16.3738 },
  zoom = 12,
  layer,
  onMapClick,
  marker,
  userLocation,
  polylines,
  segments,
  hotspots,
}: PollenMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlayRef = useRef<google.maps.ImageMapType | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const userAccuracyRef = useRef<google.maps.Circle | null>(null);
  const didCenterOnUserRef = useRef(false);
  const polylineRefs = useRef<google.maps.Polyline[]>([]);
  const segmentRefs = useRef<google.maps.Polyline[]>([]);
  const hotspotRefs = useRef<google.maps.Marker[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
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

  // User location: render a blue "you are here" dot with a soft halo.
  // Also pan to it the first time we get a fix, so the map isn't stuck
  // on the default Vienna center when geolocation arrives after init.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.setMap(null);
      userMarkerRef.current = null;
    }
    if (userAccuracyRef.current) {
      userAccuracyRef.current.setMap(null);
      userAccuracyRef.current = null;
    }
    if (!userLocation) return;
    userAccuracyRef.current = new google.maps.Circle({
      map,
      center: userLocation,
      radius: 60,
      strokeColor: "#1D4ED8",
      strokeOpacity: 0.35,
      strokeWeight: 1,
      fillColor: "#3B82F6",
      fillOpacity: 0.18,
      clickable: false,
    });
    userMarkerRef.current = new google.maps.Marker({
      position: userLocation,
      map,
      zIndex: 1000,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: "#1D4ED8",
        fillOpacity: 1,
        strokeColor: "#fff",
        strokeWeight: 3,
      },
      title: "Your location",
    });
    if (!didCenterOnUserRef.current) {
      map.panTo(userLocation);
      didCenterOnUserRef.current = true;
    }
  }, [userLocation]);

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
  }, [polylines]);

  // Multi-colored segments
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    segmentRefs.current.forEach((p) => p.setMap(null));
    segmentRefs.current = [];
    if (!segments) return;
    segments.forEach((seg) => {
      const line = new google.maps.Polyline({
        path: [seg.from, seg.to],
        map,
        strokeColor: seg.color,
        strokeWeight: seg.weight ?? 7,
        strokeOpacity: seg.opacity ?? 0.95,
      });
      segmentRefs.current.push(line);
    });
  }, [segments]);

  // Fit bounds whenever polylines/segments change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    const bounds = new google.maps.LatLngBounds();
    polylines?.forEach((pl) => pl.path.forEach((p) => bounds.extend(p)));
    segments?.forEach((s) => {
      bounds.extend(s.from);
      bounds.extend(s.to);
    });
    if (!bounds.isEmpty()) map.fitBounds(bounds, 60);
  }, [polylines, segments]);

  // Hotspot markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    hotspotRefs.current.forEach((m) => m.setMap(null));
    hotspotRefs.current = [];
    if (!infoRef.current) {
      infoRef.current = new google.maps.InfoWindow();
    }
    if (!hotspots) return;
    hotspots.forEach((h) => {
      const m = new google.maps.Marker({
        position: { lat: h.lat, lng: h.lng },
        map,
        title: h.title,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: h.color,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
      m.addListener("click", () => {
        infoRef.current?.setContent(
          `<div style="font: 500 12px system-ui; color:#111; max-width: 220px;">
            <div style="font-weight:600;margin-bottom:4px;">${h.title}</div>
            <div style="color:#555;line-height:1.4;">${h.breakdown}</div>
          </div>`,
        );
        infoRef.current?.open({ map, anchor: m });
      });
      hotspotRefs.current.push(m);
    });
  }, [hotspots]);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted p-4 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }
  return <div ref={containerRef} className="h-full w-full" />;
}