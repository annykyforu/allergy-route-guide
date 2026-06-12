
## Goal

Make the safe-route screen explain *why* a route is risky, *where* the bad stretches are, *when* to leave, and *what it means for the user's specific allergens* (e.g. birch).

## 1. Plant-level allergy model

Replace `AllergyType = "TREE" | "GRASS" | "WEED"` with a richer model that still includes the three categories plus the plants Google Pollen actually reports.

- `src/hooks/use-allergies.ts`: store `{ categories: string[]; plants: string[] }` in localStorage (migrate the old array). Plants list from Google's plantInfo codes: `BIRCH`, `OAK`, `ALDER`, `HAZEL`, `ASH`, `OLIVE`, `JUNIPER`, `CYPRESS_PINE`, `MAPLE`, `ELM`, `COTTONWOOD`, `GRAMINALES`, `RAGWEED`, `MUGWORT`, `NETTLE`. Group by category in the picker.
- `src/routes/settings.tsx`: two sections — Categories (Tree/Grass/Weed quick toggles) and Specific plants (collapsible groups with checkboxes). Plant selection auto-enables its parent category.

## 2. Personalized route scoring

`src/lib/safe-route.functions.ts`:
- Sample more densely (~12 points along the path instead of 5) so segment coloring is meaningful.
- For each sample, request `plantsDescription=true` and return **both** the `pollenTypeInfo` (category UPI) **and** `plantInfo` (per-plant UPI + `inSeason`).
- Accept new input: `allergyProfile: { categories: string[]; plants: string[] }`.
- Compute `personalizedScore` per sample = max UPI across the user's selected plants (if any) AND selected categories. If nothing selected, fall back to overall max (current behavior).
- Return per-sample breakdown: `{ lat, lng, categoryScores: {TREE,GRASS,WEED}, plantScores: Record<code, {value, inSeason}>, personalized: number, worstContributor: string }`.
- Route summary adds `personalizedAvg`, `personalizedMax`, `worstPlant` (most frequent top contributor).
- Safest selection uses `personalizedAvg`, not raw average.

## 3. Color-coded segments on the map

`src/components/PollenMap.tsx`:
- Extend `polylines` prop to accept an alternative shape: `{ segments: Array<{ from, to, color, weight, opacity }> }`. When provided, render one `google.maps.Polyline` per segment so colors can vary along the route.
- Keep the existing single-color polyline path as fallback for non-selected routes.

`src/routes/safe-route.tsx`:
- For the selected route, build segments between consecutive samples and color each by `pollenColor(personalized)`. Non-selected routes stay grey.

## 4. Hotspot markers

`PollenMap.tsx`: new optional `hotspots` prop — array of `{ lat, lng, value, title, breakdown }`. Render small colored circle markers with an `InfoWindow` on click showing the plant/category breakdown ("Birch 4/5 · in season, Oak 2/5, Grass 1/5").

`safe-route.tsx`: pick the top 2–3 samples by `personalized` score on the selected route as hotspots.

## 5. Time-of-day exposure preview

Google Pollen API only returns daily values (not hourly), so a true hour-by-hour preview isn't possible from that source. Compromise:
- Show a **5-day exposure timeline** for the selected route's midpoint, using daily forecast data the API already provides. A small horizontal bar chart: one cell per day, colored by personalized score, with the worst contributing plant labeled underneath.
- Add a "Best day to travel" callout that picks the lowest-score day from the 5-day window.

New server fn `getRouteExposureForecast(midpoint, allergyProfile)` in `safe-route.functions.ts` that calls the Pollen forecast endpoint once and applies the same personalized scoring across `dailyInfo`.

New component `src/components/RouteExposureTimeline.tsx` renders the 5 colored cells under the route list.

## 6. Route card UI

Each route card gets:
- The personalized average + label ("Birch + Grass risk: High")
- A mini segment-bar visualization of the path's personalized scores
- The "worst contributor" line ("Hotspot: Birch 4/5 near sample 3")

## Technical notes

- All scoring stays server-side in `safe-route.functions.ts`; the client just renders.
- Google Pollen `mapTypes/heatmapTiles` only exposes TREE/GRASS/WEED layers — plant-level UPI is only available via `forecast:lookup`, which is what we already use for sampling. No new API surface needed.
- Sample count goes from 5 → 12. That's 12 forecast calls per route × up to 3 routes = up to 36 calls per "Find safe route" click. Already parallelized via `Promise.all`; gateway handles it.
- LocalStorage migration: if `pollenpath.allergies` contains an old `["TREE","GRASS","WEED"]` array, convert to `{ categories: [...], plants: [] }` on first read.

## Files touched

- `src/hooks/use-allergies.ts` — new schema + migration
- `src/routes/settings.tsx` — plant picker UI
- `src/lib/safe-route.functions.ts` — denser sampling, personalized scoring, per-sample breakdown, exposure forecast fn
- `src/components/PollenMap.tsx` — multi-segment polylines + hotspot markers
- `src/components/RouteExposureTimeline.tsx` — new
- `src/routes/safe-route.tsx` — wire it all together, hotspots, timeline, richer cards

## Out of scope

- True hourly forecast (Google Pollen doesn't expose it).
- Editing allergy profile from the route screen itself — stays in Settings.
