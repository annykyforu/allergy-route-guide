/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { pollenHex } from "@/lib/google-maps-loader";
import {
  getNavigationRoute,
  type NavigationStep,
} from "@/lib/safe-route.functions";
import {
  X,
  Loader2,
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  RotateCcw,
  Flag,
  Volume2,
  VolumeX,
} from "lucide-react";

interface NavigationViewProps {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  travelMode: "WALK" | "BICYCLE" | "TRANSIT" | "DRIVE";
  destinationLabel?: string;
  // Optional pollen-exposure samples along the route; when provided, the
  // route polyline is colored by the nearest sample's personalized score.
  exposureSamples?: Array<{ lat: number; lng: number; personalized: number }>;
  onClose: () => void;
}

function haversine(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

function formatDuration(s: number): string {
  if (s < 60) return `${Math.round(s)} sec`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function maneuverIcon(maneuver: string | null) {
  const m = (maneuver ?? "").toUpperCase();
  if (m.includes("LEFT")) return CornerUpLeft;
  if (m.includes("RIGHT")) return CornerUpRight;
  if (m.includes("UTURN")) return RotateCcw;
  if (m.includes("DESTINATION") || m.includes("ARRIVE")) return Flag;
  return ArrowUp;
}

// Strip HTML from Google's navigation instructions.
function stripHtml(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, "");
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

export function NavigationView({
  origin,
  destination,
  travelMode,
  destinationLabel,
  exposureSamples,
  onClose,
}: NavigationViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const routeLinesRef = useRef<google.maps.Polyline[]>([]);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const destMarkerRef = useRef<google.maps.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [heading, setHeading] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const [arrived, setArrived] = useState(false);
  const lastSpokenRef = useRef<number>(-1);

  const fetchRoute = useServerFn(getNavigationRoute);
  const routeQuery = useQuery({
    queryKey: [
      "nav-route",
      origin.lat,
      origin.lng,
      destination.lat,
      destination.lng,
      travelMode,
    ],
    queryFn: () =>
      fetchRoute({ data: { origin, destination, travelMode } }),
    staleTime: 1000 * 60 * 5,
  });
  const route = routeQuery.data;
  const steps: NavigationStep[] = route?.steps ?? [];
  const currentStep = steps[stepIndex] ?? null;

  // Init map.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !containerRef.current) return;
        const map = new g.maps.Map(containerRef.current, {
          center: origin,
          zoom: 17,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          tilt: 0,
          styles: [
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
          ],
        });
        mapRef.current = map;
        destMarkerRef.current = new g.maps.Marker({
          position: destination,
          map,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#111827",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3,
          },
        });
        setMapReady(true);
      })
      .catch(() => {
        // map load failure - UI still renders instructions
      });
    return () => {
      cancelled = true;
      routeLinesRef.current.forEach((l) => l.setMap(null));
      routeLinesRef.current = [];
      userMarkerRef.current?.setMap(null);
      destMarkerRef.current?.setMap(null);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw the route polyline once route + map ready. If exposure samples are
  // provided, color each sub-segment by the nearest sample's pollen value;
  // otherwise fall back to a single blue line.
  useEffect(() => {
    if (!mapReady || !route || !mapRef.current) return;
    routeLinesRef.current.forEach((l) => l.setMap(null));
    routeLinesRef.current = [];
    const path = route.polyline;
    if (path.length < 2) return;

    if (!exposureSamples || exposureSamples.length === 0) {
      const line = new google.maps.Polyline({
        path,
        strokeColor: "#2563EB",
        strokeOpacity: 0.9,
        strokeWeight: 6,
        map: mapRef.current,
      });
      routeLinesRef.current = [line];
      return;
    }

    // For each polyline point, find the nearest exposure sample and use its
    // personalized score for the color. Then merge consecutive same-color
    // segments into a single polyline for efficiency.
    const pointColors = path.map((p) => {
      let best = Infinity;
      let bestVal = 0;
      for (const s of exposureSamples) {
        const d = haversine(p, s);
        if (d < best) {
          best = d;
          bestVal = s.personalized;
        }
      }
      return pollenHex(bestVal);
    });

    let segStart = 0;
    for (let i = 1; i <= path.length; i++) {
      const atEnd = i === path.length;
      const colorChanged = !atEnd && pointColors[i] !== pointColors[segStart];
      if (atEnd || colorChanged) {
        const segPath = path.slice(segStart, i + (atEnd ? 0 : 1));
        if (segPath.length >= 2) {
          const line = new google.maps.Polyline({
            path: segPath,
            strokeColor: pointColors[segStart],
            strokeOpacity: 0.95,
            strokeWeight: 7,
            map: mapRef.current!,
          });
          routeLinesRef.current.push(line);
        }
        segStart = i;
      }
    }
  }, [mapReady, route, exposureSamples]);

  // Watch user geolocation.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (pos.coords.heading != null && !Number.isNaN(pos.coords.heading)) {
          setHeading(pos.coords.heading);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Render user marker & follow camera.
  useEffect(() => {
    if (!mapReady || !userPos || !mapRef.current) return;
    if (!userMarkerRef.current) {
      userMarkerRef.current = new google.maps.Marker({
        position: userPos,
        map: mapRef.current,
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 5,
          fillColor: "#2563EB",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          rotation: heading ?? 0,
        },
      });
    } else {
      userMarkerRef.current.setPosition(userPos);
      const icon = userMarkerRef.current.getIcon() as google.maps.Symbol;
      userMarkerRef.current.setIcon({ ...icon, rotation: heading ?? 0 });
    }
    mapRef.current.panTo(userPos);
  }, [userPos, mapReady, heading]);

  // Advance step when user approaches its end location.
  useEffect(() => {
    if (!userPos || !steps.length || arrived) return;
    const step = steps[stepIndex];
    if (!step) return;
    const dToEnd = haversine(userPos, step.endLocation);
    const advanceThreshold = travelMode === "WALK" ? 20 : 35;
    if (dToEnd < advanceThreshold) {
      if (stepIndex >= steps.length - 1) {
        setArrived(true);
      } else {
        setStepIndex((i) => Math.min(i + 1, steps.length - 1));
      }
    }
  }, [userPos, steps, stepIndex, travelMode, arrived]);

  // Voice prompts when a new step becomes current.
  useEffect(() => {
    if (!voiceOn || !currentStep || arrived) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (lastSpokenRef.current === stepIndex) return;
    lastSpokenRef.current = stepIndex;
    const text = stripHtml(currentStep.instruction);
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1;
      u.lang = "en-US";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      // ignore
    }
  }, [stepIndex, currentStep, voiceOn, arrived]);

  // Arrival voice.
  useEffect(() => {
    if (!arrived || !voiceOn) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      const u = new SpeechSynthesisUtterance("You have arrived");
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      // ignore
    }
  }, [arrived, voiceOn]);

  // Stop any speech on close.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const distToManeuver = userPos && currentStep
    ? haversine(userPos, currentStep.endLocation)
    : currentStep?.distanceMeters ?? 0;

  // Remaining distance / ETA: sum of remaining steps + current to-maneuver.
  const remainingDistance = (() => {
    if (!steps.length) return route?.distanceMeters ?? 0;
    let d = distToManeuver;
    for (let i = stepIndex + 1; i < steps.length; i++) {
      d += steps[i].distanceMeters;
    }
    return d;
  })();
  const totalDistance = route?.distanceMeters ?? 1;
  const remainingDuration = route
    ? (route.durationSeconds * remainingDistance) / Math.max(totalDistance, 1)
    : 0;
  const eta = new Date(Date.now() + remainingDuration * 1000);

  const Icon = maneuverIcon(currentStep?.maneuver ?? null);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top banner: current maneuver */}
      <div className="relative bg-primary px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-primary-foreground shadow-md">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
            <Icon className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-2xl font-bold leading-tight">
              {formatDistance(distToManeuver)}
            </div>
            <div className="text-sm opacity-95 line-clamp-2">
              {currentStep
                ? stripHtml(currentStep.instruction)
                : routeQuery.isPending
                  ? "Loading route…"
                  : "Head to start"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setVoiceOn((v) => !v)}
            aria-label={voiceOn ? "Mute voice" : "Unmute voice"}
            className="rounded-full bg-primary-foreground/15 p-2 transition-colors hover:bg-primary-foreground/25"
          >
            {voiceOn ? (
              <Volume2 className="h-5 w-5" />
            ) : (
              <VolumeX className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <div ref={containerRef} className="h-full w-full" />
        {routeQuery.isPending && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="h-6 w-6 animate-spin text-foreground" />
          </div>
        )}
        {routeQuery.isError && (
          <div className="absolute inset-x-4 top-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            Could not load navigation route.
          </div>
        )}
        {arrived && (
          <div className="absolute inset-x-4 top-4 rounded-xl bg-[oklch(0.55_0.15_145)] p-3 text-center text-sm font-semibold text-white shadow-lg">
            You have arrived{destinationLabel ? ` at ${destinationLabel}` : ""}.
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              ETA
            </div>
            <div className="text-base font-semibold text-foreground">
              {eta.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Remaining
            </div>
            <div className="text-base font-semibold text-foreground">
              {formatDistance(remainingDistance)} ·{" "}
              {formatDuration(remainingDuration)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground"
          >
            <X className="h-4 w-4" />
            End
          </button>
        </div>
      </div>
    </div>
  );
}