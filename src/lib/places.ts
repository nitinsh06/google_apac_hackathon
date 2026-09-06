import type { JournalCategory, JournalEntry, JournalLocation } from '../types.ts';

/** One physical spot on the map, holding every reflection written there. */
export interface MapPlace {
  id: string;
  location: JournalLocation;
  entries: JournalEntry[];
  category: JournalCategory;
  isSample: boolean;
  /** Epoch ms of the most recent reflection at this place. */
  latestAt: number;
}

/** One rendered pin: a single place, or several places merged at this zoom. */
export interface PinGroup {
  id: string;
  lat: number;
  lng: number;
  places: MapPlace[];
  entryCount: number;
  category: JournalCategory;
  isSample: boolean;
}

export interface CategoryStyle {
  /** Gradient stops for the pin cover tile. */
  from: string;
  to: string;
  /** Static Tailwind classes (no runtime concatenation, so v4 can scan them). */
  chip: string;
  dot: string;
}

const FALLBACK_STYLE: CategoryStyle = {
  from: '#475569',
  to: '#94a3b8',
  chip: 'bg-slate-100 text-slate-700 border-slate-200',
  dot: 'bg-slate-500',
};

export const CATEGORY_STYLES: Record<JournalCategory, CategoryStyle> = {
  Personal: {
    from: '#6d28d9',
    to: '#a78bfa',
    chip: 'bg-violet-50 text-violet-700 border-violet-200',
    dot: 'bg-violet-500',
  },
  Work: {
    from: '#0369a1',
    to: '#38bdf8',
    chip: 'bg-sky-50 text-sky-700 border-sky-200',
    dot: 'bg-sky-500',
  },
  Ideas: {
    from: '#b45309',
    to: '#fbbf24',
    chip: 'bg-amber-50 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
  },
  Gratitude: {
    from: '#be123c',
    to: '#fb7185',
    chip: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
  Mindfulness: {
    from: '#047857',
    to: '#34d399',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
};

export const categoryStyle = (category?: string): CategoryStyle =>
  (category && CATEGORY_STYLES[category as JournalCategory]) || FALLBACK_STYLE;

/** Coordinates arriving from Firestore, geolocation or Places are untrusted input. */
export function hasCoordinates(
  location: JournalLocation | null | undefined
): location is JournalLocation {
  if (!location) return false;
  const { lat, lng } = location;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

const timeOf = (value?: string): number => {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : 0;
};

export function dominantCategory(entries: JournalEntry[]): JournalCategory {
  const tally = new Map<JournalCategory, number>();
  for (const entry of entries) {
    if (!entry.category) continue;
    tally.set(entry.category, (tally.get(entry.category) ?? 0) + 1);
  }
  let best: JournalCategory = entries[0]?.category ?? 'Personal';
  let bestCount = 0;
  tally.forEach((count, category) => {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  });
  return best;
}

/**
 * Fold entries into places. Entries without usable coordinates are simply left
 * off the map. ~11 m of precision keeps repeat visits to one spot together.
 */
export function buildPlaces(entries: JournalEntry[], isSample = false): MapPlace[] {
  const buckets = new Map<string, { location: JournalLocation; entries: JournalEntry[] }>();

  for (const entry of entries) {
    if (!hasCoordinates(entry.location)) continue;
    const location = entry.location;
    const key = `${location.lat.toFixed(4)}:${location.lng.toFixed(4)}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.entries.push(entry);
      // Prefer the richest label we have seen for this spot.
      if (!bucket.location.address && location.address) bucket.location = location;
    } else {
      buckets.set(key, { location, entries: [entry] });
    }
  }

  return Array.from(buckets.entries())
    .map(([id, bucket]) => {
      const sorted = [...bucket.entries].sort(
        (a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt)
      );
      return {
        id,
        location: bucket.location,
        entries: sorted,
        category: dominantCategory(sorted),
        isSample,
        latestAt: timeOf(sorted[0]?.updatedAt),
      };
    })
    .sort((a, b) => b.latestAt - a.latestAt);
}

/**
 * Merge places that would overlap on screen at `zoom` into a single pin, the way
 * a photo map collapses nearby shots and splits them apart as you zoom in.
 * Web-Mercator pixel positions depend only on zoom, never on pan, so this is pure.
 */
const TILE_SIZE = 256;

/** Web-Mercator world pixel position at a given zoom — the projection every
 *  slippy map (Google's included) uses, so pin overlap can be reasoned about
 *  without holding a map instance. */
function project(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: scale * (0.5 + lng / 360),
    y: scale * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)),
  };
}

function unproject(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  return {
    lat: (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale))),
    lng: (x / scale - 0.5) * 360,
  };
}

/**
 * Merge places that would overlap on screen at `zoom` into a single pin, the way
 * a photo map collapses nearby shots and splits them apart as you zoom in.
 * Pixel positions depend only on zoom, never on pan, so this stays pure.
 */
export function groupPlaces(places: MapPlace[], zoom: number, radiusPx = 72): PinGroup[] {
  if (places.length === 0) return [];

  const points = places.map((place) => project(place.location.lat, place.location.lng, zoom));

  // Seed from the busiest places so dense spots anchor their own pin.
  const order = places
    .map((_, index) => index)
    .sort((a, b) => places[b].entries.length - places[a].entries.length || a - b);

  const claimed = new Array<boolean>(places.length).fill(false);
  const radiusSq = radiusPx * radiusPx;
  const groups: PinGroup[] = [];

  for (const seed of order) {
    if (claimed[seed]) continue;
    claimed[seed] = true;

    const members = [places[seed]];
    let sumX = points[seed].x;
    let sumY = points[seed].y;

    for (const candidate of order) {
      if (claimed[candidate]) continue;
      const dx = points[seed].x - points[candidate].x;
      const dy = points[seed].y - points[candidate].y;
      if (dx * dx + dy * dy > radiusSq) continue;
      claimed[candidate] = true;
      members.push(places[candidate]);
      sumX += points[candidate].x;
      sumY += points[candidate].y;
    }

    const center = unproject(sumX / members.length, sumY / members.length, zoom);
    const allEntries = members.flatMap((place) => place.entries);

    groups.push({
      id: members
        .map((place) => place.id)
        .sort()
        .join('~'),
      lat: center.lat,
      lng: center.lng,
      places: members,
      entryCount: allEntries.length,
      category: dominantCategory(allEntries),
      isSample: members.some((place) => place.isSample),
    });
  }

  return groups;
}

/** "3 reflections" / "1 reflection" — used in several surfaces. */
export const reflectionCount = (count: number): string =>
  `${count} ${count === 1 ? 'reflection' : 'reflections'}`;

export function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
}
