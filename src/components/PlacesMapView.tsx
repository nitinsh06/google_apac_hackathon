import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Compass,
  Layers,
  LocateFixed,
  MapPin,
  Maximize2,
  Minus,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { JournalCategory, JournalEntry, JournalLocation } from '../types.ts';
import {
  buildPlaces,
  categoryStyle,
  dominantCategory,
  formatCoords,
  reflectionCount,
} from '../lib/places.ts';
import type { MapPlace } from '../lib/places.ts';
import { MAP_TYPES, PlacesMap } from './PlacesMap.tsx';
import type { Coords, MapTypeId, PlacesMapHandle } from './PlacesMap.tsx';
import { CoverTile } from './CoverTile.tsx';
import { SAMPLE_ENTRIES } from '../lib/samplePlaces.ts';
import { saveJournalEntry } from '../lib/firebase.ts';

interface PlacesMapViewProps {
  userId: string;
  isGuest?: boolean;
  entries: JournalEntry[];
  onSelectEntry: (entry: JournalEntry) => void;
  onNewEntryAtLocation?: (location: JournalLocation) => void;
  onNewEntry: () => void;
}

type CategoryFilter = JournalCategory | 'All';

const CATEGORIES: CategoryFilter[] = [
  'All',
  'Personal',
  'Work',
  'Ideas',
  'Gratitude',
  'Mindfulness',
];

const dateLabel = (iso?: string): string => {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const previewOf = (entry: JournalEntry): string =>
  entry.summary?.trim() ||
  entry.turns.find((turn) => turn.role === 'user')?.text?.trim() ||
  entry.turns[0]?.text?.trim() ||
  'No reflection text yet.';

function matchPlaces(places: MapPlace[], rawQuery: string, category: CategoryFilter): MapPlace[] {
  const query = rawQuery.trim().toLowerCase();
  const result: MapPlace[] = [];

  for (const place of places) {
    const placeMatches =
      !query ||
      place.location.name.toLowerCase().includes(query) ||
      (place.location.address ?? '').toLowerCase().includes(query);

    const entries = place.entries.filter((entry) => {
      if (category !== 'All' && entry.category !== category) return false;
      if (!query || placeMatches) return true;
      return (
        (entry.title ?? '').toLowerCase().includes(query) ||
        (entry.summary ?? '').toLowerCase().includes(query) ||
        entry.turns.some((turn) => (turn.text ?? '').toLowerCase().includes(query))
      );
    });

    if (entries.length > 0) {
      result.push({ ...place, entries, category: dominantCategory(entries) });
    }
  }

  return result;
}

const EntryCard: React.FC<{ entry: JournalEntry; onOpen: () => void; wide?: boolean }> = ({
  entry,
  onOpen,
  wide = false,
}) => {
  const style = categoryStyle(entry.category);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group snap-start shrink-0 text-left ${
        wide ? 'w-full' : 'w-[252px]'
      } rounded-xl border border-slate-200 bg-white p-3 shadow-xs transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer`}
    >
      <span className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold ${style.chip}`}
        >
          {entry.category}
        </span>
        <span className="text-[10px] font-medium text-slate-500">{dateLabel(entry.updatedAt)}</span>
      </span>

      <span className="mt-1.5 block truncate text-sm font-semibold text-slate-900 group-hover:text-blue-700">
        {entry.title || 'Untitled reflection'}
      </span>

      <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
        {previewOf(entry)}
      </span>

      <span className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        <span>
          {entry.turns.length} {entry.turns.length === 1 ? 'turn' : 'turns'}
        </span>
        <span className="inline-flex items-center gap-1 font-semibold text-blue-700">
          Open
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </button>
  );
};

const PlaceCard: React.FC<{ place: MapPlace; onOpen: () => void }> = ({ place, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="group snap-start w-[236px] shrink-0 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer"
  >
    <span className="flex items-start gap-2.5">
      <CoverTile category={place.category} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-blue-700">
          {place.location.name}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-slate-600">
          {place.location.address || formatCoords(place.location.lat, place.location.lng)}
        </span>
      </span>
    </span>
    <span className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
      <span className="font-semibold text-slate-700">{reflectionCount(place.entries.length)}</span>
      <span className="text-slate-500">{dateLabel(place.entries[0]?.updatedAt)}</span>
    </span>
  </button>
);

export const PlacesMapView: React.FC<PlacesMapViewProps> = ({
  userId,
  isGuest = false,
  entries,
  onSelectEntry,
  onNewEntryAtLocation,
  onNewEntry,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('All');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mapType, setMapType] = useState<MapTypeId>('roadmap');
  const [layersOpen, setLayersOpen] = useState(false);
  const [dropMode, setDropMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<Coords | null>(null);
  const [userLocation, setUserLocation] = useState<Coords | null>(null);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [seedState, setSeedState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [sheetHeight, setSheetHeight] = useState(196);

  const mapHandle = useRef<PlacesMapHandle>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // Entries without coordinates simply stay off the map.
  const ownPlaces = useMemo(() => buildPlaces(entries), [entries]);
  const samplePlaces = useMemo(() => buildPlaces(SAMPLE_ENTRIES, true), []);
  const showingSamples = ownPlaces.length === 0;
  const sourcePlaces = showingSamples ? samplePlaces : ownPlaces;

  const places = useMemo(
    () => matchPlaces(sourcePlaces, query, category),
    [sourcePlaces, query, category]
  );

  const pinnedCount = useMemo(
    () => places.reduce((total, place) => total + place.entries.length, 0),
    [places]
  );

  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId]
  );

  const isFiltered = query.trim().length > 0 || category !== 'All';

  // Drop a selection the filters have hidden.
  useEffect(() => {
    if (selectedPlaceId && !places.some((place) => place.id === selectedPlaceId)) {
      setSelectedPlaceId(null);
    }
  }, [places, selectedPlaceId]);

  // Keep the rail at the start when the sheet switches context.
  useEffect(() => {
    railRef.current?.scrollTo({ left: 0 });
  }, [selectedPlaceId, query, category]);

  // Let the map know how much of the viewport the sheet is covering.
  useEffect(() => {
    const element = sheetRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSheetHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (layersOpen) return setLayersOpen(false);
      if (pendingPin) return setPendingPin(null);
      if (dropMode) return setDropMode(false);
      if (selectedPlaceId) return setSelectedPlaceId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [layersOpen, pendingPin, dropMode, selectedPlaceId]);

  const handleSelectPlace = useCallback((placeId: string | null) => {
    setSelectedPlaceId(placeId);
    if (placeId) {
      setPendingPin(null);
      setExpanded(false);
    }
  }, []);

  const handleDropPin = useCallback((coords: Coords) => {
    setPendingPin(coords);
    setDropMode(false);
    setSelectedPlaceId(null);
    setExpanded(false);
  }, []);

  const handleLocateMe = () => {
    setLocateError(null);
    if (!navigator.geolocation) {
      setLocateError('This browser cannot share a location.');
      return;
    }
    // Consent is the browser prompt; nothing is stored beyond this session.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        });
      },
      () => setLocateError('Location permission denied — search for a place instead.'),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  };

  const handleWriteAtPendingPin = () => {
    if (!pendingPin || !onNewEntryAtLocation) return;
    onNewEntryAtLocation({
      name: `Pinned spot · ${formatCoords(pendingPin.lat, pendingPin.lng)}`,
      lat: pendingPin.lat,
      lng: pendingPin.lng,
    });
  };

  const handleSeedSamples = async () => {
    if (!userId || isGuest || seedState === 'saving' || seedState === 'done') return;
    setSeedState('saving');
    try {
      const stamp = Date.now();
      await Promise.all(
        SAMPLE_ENTRIES.map((entry, index) =>
          saveJournalEntry(userId, {
            ...entry,
            id: `sample-${stamp}-${index}`,
            userId,
            createdAt: entry.createdAt,
            updatedAt: new Date().toISOString(),
          })
        )
      );
      setSeedState('done');
    } catch (error) {
      console.error('Could not add the sample places:', error);
      setSeedState('error');
    }
  };

  // ── Bottom-sheet drag ────────────────────────────────────────────────────
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);

  const onGrabStart = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onGrabMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const dy = event.clientY - state.y;
    if (Math.abs(dy) > 6) state.moved = true;
    if (dy < -40 && !expanded) {
      setExpanded(true);
      drag.current = null;
    } else if (dy > 40 && expanded) {
      setExpanded(false);
      drag.current = null;
    }
  };

  // A drag has already decided the sheet's state, so let it swallow the click
  // the browser fires afterwards; a plain click still toggles.
  const onGrabEnd = () => {
    const state = drag.current;
    drag.current = null;
    swallowClick.current = !state || state.moved;
  };

  const onGrabClick = () => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    setExpanded((open) => !open);
  };

  const hudButton =
    'flex h-9 w-9 items-center justify-center text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:text-slate-400';

  return (
    <div
      id="places-map-view"
      className="relative flex-1 min-h-0 overflow-hidden bg-slate-200"
      style={{ ['--sheet-inset' as string]: `${sheetHeight}px` }}
    >
      <PlacesMap
        ref={mapHandle}
        places={places}
        selectedPlaceId={selectedPlaceId}
        onSelectPlace={handleSelectPlace}
        dropMode={dropMode}
        onDropPin={handleDropPin}
        pendingPin={pendingPin}
        userLocation={userLocation}
        mapType={mapType}
        bottomInset={sheetHeight + 44}
        fitTrigger={fitTrigger}
      />

      {/* ── Search, filters and map controls ─────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex items-start gap-2 p-3 sm:p-4">
        <div className="pointer-events-auto min-w-0 flex-1 space-y-2">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              id="places-search-input"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search places or reflections"
              aria-label="Search places or reflections"
              className="w-full rounded-full border border-slate-200/80 bg-white/95 py-2.5 pl-10 pr-10 text-sm font-medium text-slate-900 shadow-lg shadow-slate-900/10 backdrop-blur-md transition-shadow placeholder:font-normal placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="no-scrollbar flex max-w-full items-center gap-1.5 overflow-x-auto pr-2">
            {CATEGORIES.map((option) => {
              const active = category === option;
              const dot = option === 'All' ? null : categoryStyle(option).dot;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCategory(option)}
                  aria-pressed={active}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur-md transition-colors cursor-pointer ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200/80 bg-white/95 text-slate-700 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  {dot && (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${dot} ${active ? 'opacity-100' : ''}`}
                    />
                  )}
                  {option === 'All' ? 'All places' : option}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pointer-events-auto relative flex flex-col items-end gap-2">
          <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-900/10 backdrop-blur-md">
            <button type="button" onClick={() => mapHandle.current?.zoomIn()} aria-label="Zoom in" className={hudButton}>
              <Plus className="h-4 w-4" />
            </button>
            <span className="mx-2 h-px bg-slate-200" />
            <button type="button" onClick={() => mapHandle.current?.zoomOut()} aria-label="Zoom out" className={hudButton}>
              <Minus className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-900/10 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setFitTrigger((n) => n + 1)}
              aria-label="Show every place"
              title="Show every place"
              className={hudButton}
              disabled={places.length === 0}
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <span className="mx-2 h-px bg-slate-200" />
            <button
              type="button"
              onClick={handleLocateMe}
              aria-label="Find my location"
              title="Find my location"
              className={hudButton}
            >
              <LocateFixed className="h-4 w-4" />
            </button>
            <span className="mx-2 h-px bg-slate-200" />
            <button
              type="button"
              onClick={() => setLayersOpen((open) => !open)}
              aria-label="Change map style"
              aria-expanded={layersOpen}
              title="Change map style"
              className={`${hudButton} ${layersOpen ? 'bg-slate-100 text-slate-900' : ''}`}
            >
              <Layers className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setDropMode((armed) => !armed);
              setPendingPin(null);
            }}
            aria-pressed={dropMode}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold shadow-lg shadow-slate-900/10 backdrop-blur-md transition-colors cursor-pointer ${
              dropMode
                ? 'border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700'
                : 'border-slate-200/80 bg-white/95 text-slate-700 hover:text-slate-900'
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{dropMode ? 'Tap the map' : 'Drop a pin'}</span>
          </button>

          {layersOpen && (
            <div
              role="group"
              aria-label="Map style"
              className="absolute right-0 top-[8.25rem] w-40 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/15"
            >
              {(Object.keys(MAP_TYPES) as MapTypeId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMapType(id);
                    setLayersOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    mapType === id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {MAP_TYPES[id].label}
                  {mapType === id && <CheckCircle2 className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {locateError && (
        <p
          role="status"
          className="pointer-events-none absolute left-1/2 top-3 z-[520] max-w-xs -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-medium text-white shadow-lg sm:top-4"
        >
          {locateError}
        </p>
      )}

      {/* ── Bottom sheet ─────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] flex justify-center p-3 pb-7 sm:p-4 sm:pb-7">
        <div
          ref={sheetRef}
          className="pointer-events-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_18px_40px_-12px_rgba(15,23,42,0.35)] backdrop-blur-xl"
        >
          <div
            onPointerDown={onGrabStart}
            onPointerMove={onGrabMove}
            onPointerUp={onGrabEnd}
            onPointerCancel={onGrabEnd}
            onClick={onGrabClick}
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse the place list' : 'Expand the place list'}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setExpanded((open) => !open);
              }
            }}
            className="flex touch-none items-center justify-center py-2.5 cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
          >
            <span className="h-1 w-9 rounded-full bg-slate-300" />
          </div>

          {/* Sheet header */}
          <div className="flex items-center gap-3 border-b border-slate-200/80 px-4 pb-3">
            {selectedPlace ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedPlaceId(null)}
                  aria-label="Back to all places"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <CoverTile category={selectedPlace.category} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold tracking-tight text-slate-900">
                    {selectedPlace.location.name}
                  </h2>
                  <p className="truncate text-xs text-slate-600">
                    {selectedPlace.location.address ||
                      formatCoords(selectedPlace.location.lat, selectedPlace.location.lng)}
                    <span className="text-slate-400"> · </span>
                    {reflectionCount(selectedPlace.entries.length)}
                  </p>
                </div>
                {onNewEntryAtLocation && (
                  <button
                    type="button"
                    onClick={() => onNewEntryAtLocation(selectedPlace.location)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Write here</span>
                  </button>
                )}
              </>
            ) : pendingPin ? (
              <>
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm ring-1 ring-black/5"
                  style={{ backgroundImage: 'linear-gradient(140deg, #0f766e, #2dd4bf)' }}
                  aria-hidden="true"
                >
                  <MapPin className="h-5 w-5 stroke-[2.2]" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold tracking-tight text-slate-900">
                    New pin dropped
                  </h2>
                  <p className="truncate font-mono text-xs text-slate-600">
                    {formatCoords(pendingPin.lat, pendingPin.lng)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleWriteAtPendingPin}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Write here
                </button>
                <button
                  type="button"
                  onClick={() => setPendingPin(null)}
                  aria-label="Discard this pin"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold tracking-tight text-slate-900">
                    {showingSamples ? 'Places to explore' : 'Your places'}
                  </h2>
                  <p className="truncate text-xs text-slate-600">
                    {places.length === 0
                      ? 'Nothing matches these filters yet.'
                      : `${places.length} ${places.length === 1 ? 'place' : 'places'} · ${reflectionCount(
                          pinnedCount
                        )}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onNewEntry}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">New reflection</span>
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded((open) => !open)}
                  aria-label={expanded ? 'Collapse the place list' : 'Expand the place list'}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                >
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </button>
              </>
            )}
          </div>

          {/* Sheet body */}
          {places.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Compass className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-slate-900">No places match yet</p>
              <p className="mt-1 text-xs text-slate-600">
                {isFiltered
                  ? 'Try a different search or category.'
                  : 'Tag a reflection with a location and it will appear here.'}
              </p>
              {isFiltered && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setCategory('All');
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : expanded ? (
            <div className="thin-scroll max-h-[min(52vh,440px)] overflow-y-auto px-4 py-3">
              {selectedPlace ? (
                <div className="space-y-2">
                  {selectedPlace.entries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      wide
                      onOpen={() => onSelectEntry(entry)}
                    />
                  ))}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {places.map((place) => (
                    <li key={place.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectPlace(place.id)}
                        className="group flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                      >
                        <CoverTile category={place.category} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-blue-700">
                            {place.location.name}
                          </span>
                          <span className="block truncate text-xs text-slate-600">
                            {place.location.address ||
                              formatCoords(place.location.lat, place.location.lng)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-xs font-semibold text-slate-700">
                            {place.entries.length}
                          </span>
                          <span className="block text-[10px] text-slate-500">
                            {place.entries.length === 1 ? 'entry' : 'entries'}
                          </span>
                        </span>
                        <ChevronLeft
                          className="h-4 w-4 shrink-0 rotate-180 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="relative">
              <div
                ref={railRef}
                className="no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 py-3"
              >
                {selectedPlace
                  ? selectedPlace.entries.map((entry) => (
                      <EntryCard key={entry.id} entry={entry} onOpen={() => onSelectEntry(entry)} />
                    ))
                  : places.map((place) => (
                      <PlaceCard
                        key={place.id}
                        place={place}
                        onOpen={() => handleSelectPlace(place.id)}
                      />
                    ))}
              </div>
              <div
                className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white/95 to-transparent"
                aria-hidden="true"
              />
            </div>
          )}

          {/* Starter places prompt */}
          {showingSamples && !selectedPlace && !pendingPin && (
            <div className="flex items-center gap-3 border-t border-amber-200/80 bg-amber-50/80 px-4 py-2.5">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-amber-900">
                {isGuest
                  ? 'These are sample places. Sign in to pin reflections of your own.'
                  : 'None of your reflections has a location yet — these are samples.'}
              </p>
              {!isGuest && (
                <button
                  type="button"
                  onClick={handleSeedSamples}
                  disabled={seedState === 'saving' || seedState === 'done'}
                  className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
                >
                  {seedState === 'done'
                    ? 'Added to your journal'
                    : seedState === 'saving'
                    ? 'Adding…'
                    : seedState === 'error'
                    ? 'Try again'
                    : 'Add them to my journal'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
