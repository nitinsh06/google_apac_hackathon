import React, { useState, useMemo, useCallback } from 'react';
import {
  MapPin,
  Compass,
  Calendar,
  Sparkles,
  ArrowRight,
  Search,
  Filter,
  Plus,
  Navigation,
  ExternalLink,
  Layers,
  BookOpen,
  Map as MapIcon,
  ChevronRight,
  Maximize2,
  AlertCircle,
  Tag,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import type { JournalEntry, JournalLocation, JournalCategory } from '../types.ts';
import {
  ActualLeafletPlacesMap,
  INSPIRATION_SPOTS,
  type LocationCluster,
} from './ActualLeafletPlacesMap.tsx';
import { saveJournalEntry } from '../lib/firebase.ts';

interface PlacesMapViewProps {
  userId: string;
  entries: JournalEntry[];
  onSelectEntry: (entry: JournalEntry) => void;
  onNewEntryAtLocation?: (location: JournalLocation) => void;
  onNewEntry: () => void;
}

const CATEGORIES: Array<JournalCategory | 'All'> = [
  'All',
  'Personal',
  'Work',
  'Ideas',
  'Gratitude',
  'Mindfulness',
];

export const PlacesMapView: React.FC<PlacesMapViewProps> = ({
  userId,
  entries,
  onSelectEntry,
  onNewEntryAtLocation,
  onNewEntry,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<JournalCategory | 'All'>('All');
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [targetCamera, setTargetCamera] = useState<{ lat: number; lng: number } | null>(null);
  const [fitTrigger, setFitTrigger] = useState(1);
  const [activeTab, setActiveTab] = useState<'places' | 'untagged'>('places');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);

  // Separate tagged vs untagged entries
  const { taggedEntries, untaggedEntries } = useMemo(() => {
    const tagged: JournalEntry[] = [];
    const untagged: JournalEntry[] = [];

    entries.forEach((e) => {
      if (
        e.location &&
        typeof e.location.lat === 'number' &&
        typeof e.location.lng === 'number' &&
        !isNaN(e.location.lat) &&
        !isNaN(e.location.lng)
      ) {
        tagged.push(e);
      } else {
        untagged.push(e);
      }
    });

    return { taggedEntries: tagged, untaggedEntries: untagged };
  }, [entries]);

  // Filter tagged entries by search query and category
  const filteredTaggedEntries = useMemo(() => {
    return taggedEntries.filter((e) => {
      if (selectedCategory !== 'All' && e.category !== selectedCategory) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const titleMatch = (e.title || '').toLowerCase().includes(q);
      const locMatch =
        (e.location?.name || '').toLowerCase().includes(q) ||
        (e.location?.address || '').toLowerCase().includes(q);
      const turnMatch = e.turns.some((t) => (t.text || '').toLowerCase().includes(q));
      return titleMatch || locMatch || turnMatch;
    });
  }, [taggedEntries, selectedCategory, searchQuery]);

  // Cluster entries by location coordinates
  const userClusters = useMemo(() => {
    const clusterMap = new Map<string, LocationCluster>();

    filteredTaggedEntries.forEach((entry) => {
      const loc = entry.location!;
      const key = `${loc.lat.toFixed(3)},${loc.lng.toFixed(3)}`;

      if (clusterMap.has(key)) {
        clusterMap.get(key)!.entries.push(entry);
      } else {
        clusterMap.set(key, {
          id: key,
          location: loc,
          entries: [entry],
          isSample: false,
        });
      }
    });

    return Array.from(clusterMap.values());
  }, [filteredTaggedEntries]);

  // If user has zero clusters with locations, display sample inspiration spots so map & list are never empty
  const displayClusters = useMemo(() => {
    if (userClusters.length > 0) return userClusters;
    return INSPIRATION_SPOTS;
  }, [userClusters]);

  const isShowingSampleSpots = userClusters.length === 0;

  // Active selected cluster
  const selectedCluster = useMemo(() => {
    if (!selectedClusterId) {
      return displayClusters.length > 0 ? displayClusters[0] : null;
    }
    return (
      displayClusters.find((c) => c.id === selectedClusterId) ||
      (displayClusters.length > 0 ? displayClusters[0] : null)
    );
  }, [displayClusters, selectedClusterId]);

  // Focus on a cluster
  const handleSelectCluster = useCallback((cluster: LocationCluster) => {
    setSelectedClusterId(cluster.id);
    setTargetCamera({ lat: cluster.location.lat, lng: cluster.location.lng });
  }, []);

  // Fit all locations
  const handleFitAll = () => {
    setFitTrigger((prev) => prev + 1);
  };

  // User Current Geolocation
  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        setUserLocation(coords);
        setTargetCamera(coords);
      },
      (err) => {
        console.warn('Geolocation error:', err);
      },
      { enableHighAccuracy: true }
    );
  };

  // Seed sample inspiration entries into user's vault
  const handleSeedSamples = async () => {
    if (!userId || isSeeding) return;
    setIsSeeding(true);
    try {
      for (const spot of INSPIRATION_SPOTS) {
        for (const entry of spot.entries) {
          const userEntry: JournalEntry = {
            ...entry,
            id: `seed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await saveJournalEntry(userId, userEntry);
        }
      }
      setSeedSuccess(true);
      setTimeout(() => setSeedSuccess(false), 4000);
    } catch (err) {
      console.error('Failed to seed sample places:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div
      id="places-map-view-container"
      className="flex-1 flex flex-col md:flex-row h-[calc(100vh-4rem)] min-h-[550px] overflow-hidden bg-slate-50"
    >
      {/* LEFT / TOP CONTROL & MEMORY SIDEBAR */}
      <div className="w-full md:w-[420px] lg:w-[460px] flex flex-col bg-white border-r border-slate-200 shrink-0 h-1/2 md:h-full z-10 shadow-xs">
        {/* Header with Search & Stats */}
        <div className="p-4 border-b border-slate-200 space-y-3 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                <MapIcon className="w-4 h-4 stroke-[2.2]" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <span>Places & Memories</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    {displayClusters.length} Pinned
                  </span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  Interactive life map with location pin points
                </p>
              </div>
            </div>

            <button
              id="new-reflection-from-map-btn"
              onClick={onNewEntry}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              title="Start a new reflection"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Write</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              id="places-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by landmark, place, or reflection..."
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs font-medium"
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <Filter className="w-3 h-3 text-slate-400 shrink-0 mr-1" />
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Sub-Tabs: Pinned Places vs Untagged Reflections */}
          <div className="flex items-center border-b border-slate-200 pt-1 text-xs">
            <button
              id="tab-pinned-places"
              type="button"
              onClick={() => setActiveTab('places')}
              className={`flex-1 pb-2 font-semibold flex items-center justify-center gap-1.5 border-b-2 cursor-pointer transition-colors ${
                activeTab === 'places'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Locations ({displayClusters.length})</span>
            </button>

            <button
              id="tab-untagged-reflections"
              type="button"
              onClick={() => setActiveTab('untagged')}
              className={`flex-1 pb-2 font-semibold flex items-center justify-center gap-1.5 border-b-2 cursor-pointer transition-colors ${
                activeTab === 'untagged'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Untagged ({untaggedEntries.length})</span>
            </button>
          </div>
        </div>

        {/* SIDEBAR CONTENT LIST */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Sample Banner if viewing starter inspiration spots */}
          {activeTab === 'places' && isShowingSampleSpots && (
            <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs space-y-2">
              <div className="flex items-center gap-1.5 font-bold">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Showing Sample Pinned Memories</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Explore 4 starter locations on the map. Click any pin point to read reflections, or
                seed these into your vault.
              </p>
              <button
                type="button"
                onClick={handleSeedSamples}
                disabled={isSeeding || seedSuccess}
                className="w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 shadow-2xs"
              >
                {seedSuccess ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                    <span>Seeded to Your Vault!</span>
                  </>
                ) : isSeeding ? (
                  <span>Seeding memories...</span>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Save 4 Sample Places to My Journal</span>
                  </>
                )}
              </button>
            </div>
          )}

          {activeTab === 'places' ? (
            displayClusters.map((cluster) => {
              const isSelected = selectedCluster?.id === cluster.id;

              return (
                <div
                  key={cluster.id}
                  id={`location-card-${cluster.id}`}
                  className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/40 shadow-sm ring-1 ring-blue-500/20'
                      : 'border-slate-200 bg-white hover:border-slate-300 shadow-2xs'
                  }`}
                >
                  {/* Location Card Header */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectCluster(cluster)}
                    className="p-3.5 flex items-start justify-between gap-2 cursor-pointer border-b border-slate-100 select-none"
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          cluster.isSample
                            ? 'bg-amber-100 text-amber-700'
                            : isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-bold text-slate-800 leading-tight">
                            {cluster.location.name}
                          </h4>
                          {cluster.isSample && (
                            <span className="px-1.5 py-0.2 text-[9px] font-bold bg-amber-100 text-amber-800 rounded uppercase">
                              Sample
                            </span>
                          )}
                        </div>
                        {cluster.location.address && (
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                            {cluster.location.address}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono text-slate-500">
                          <span>
                            {cluster.location.lat >= 0
                              ? `${cluster.location.lat.toFixed(4)}° N`
                              : `${Math.abs(cluster.location.lat).toFixed(4)}° S`}
                          </span>
                          <span>•</span>
                          <span>
                            {cluster.location.lng >= 0
                              ? `${cluster.location.lng.toFixed(4)}° E`
                              : `${Math.abs(cluster.location.lng).toFixed(4)}° W`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {cluster.entries.length} {cluster.entries.length === 1 ? 'entry' : 'entries'}
                      </span>
                      <span className="text-[10px] text-blue-600 font-semibold hover:underline flex items-center gap-0.5">
                        <span>Focus Pin</span>
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>

                  {/* Entries List under this Location */}
                  <div className="p-2 space-y-1.5 bg-slate-50/50">
                    {cluster.entries.map((entry) => {
                      const firstTurnText = entry.turns[0]?.text || '';
                      const preview =
                        entry.summary ||
                        (firstTurnText.length > 120
                          ? `${firstTurnText.slice(0, 120)}...`
                          : firstTurnText);

                      return (
                        <div
                          key={entry.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectEntry(entry);
                          }}
                          className="p-2.5 rounded-lg bg-white hover:bg-blue-50/60 border border-slate-200/80 transition-all cursor-pointer group shadow-2xs"
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                              {entry.category}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {new Date(entry.updatedAt).toLocaleDateString()}
                            </span>
                          </div>

                          <h5 className="text-xs font-semibold text-slate-800 group-hover:text-blue-700 line-clamp-1 transition-colors">
                            {entry.title || 'Untitled Reflection'}
                          </h5>

                          <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                            {preview || 'No journal text recorded yet.'}
                          </p>

                          <div className="mt-2 flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-400">
                            <span>{entry.turns.length} dialogue turns</span>
                            <span className="text-blue-600 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                              <span>Open</span>
                              <ArrowRight className="w-2.5 h-2.5" />
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Quick Button to write another reflection at this same spot */}
                    <button
                      type="button"
                      onClick={() => {
                        if (onNewEntryAtLocation) {
                          onNewEntryAtLocation(cluster.location);
                        }
                      }}
                      className="w-full py-1.5 text-center text-xs text-blue-600 hover:text-blue-700 font-semibold hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Write reflection at {cluster.location.name}</span>
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            /* UNTAGGED ENTRIES TAB */
            <div className="space-y-2">
              <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-800">
                <p className="font-semibold flex items-center gap-1.5 mb-1">
                  <Tag className="w-3.5 h-3.5 text-blue-600" />
                  <span>Untagged Reflections</span>
                </p>
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  Pin your past reflections to physical locations so they appear on your Life Map.
                </p>
              </div>

              {untaggedEntries.length === 0 ? (
                <div className="p-6 text-center text-slate-500">
                  <Sparkles className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">All caught up!</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Every one of your reflections is pinned to a physical place.
                  </p>
                </div>
              ) : (
                untaggedEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 shadow-2xs transition-all flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {entry.category}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(entry.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <h5 className="text-xs font-bold text-slate-800 truncate">
                        {entry.title || 'Untitled Reflection'}
                      </h5>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectEntry(entry)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors shrink-0 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Pin Location</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT / MAIN INTERACTIVE MAP WITH LIVE PINS & POPUPS */}
      <div className="flex-1 relative h-1/2 md:h-full w-full min-h-[350px] overflow-hidden bg-slate-100">
        <ActualLeafletPlacesMap
          clusters={displayClusters}
          selectedCluster={selectedCluster}
          onSelectCluster={handleSelectCluster}
          onSelectEntry={onSelectEntry}
          onNewEntryAtLocation={onNewEntryAtLocation}
          targetCamera={targetCamera}
          fitTrigger={fitTrigger}
          userLocation={userLocation}
        />

        {/* Map Floating HUD Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-[400]">
          <button
            id="map-fit-all-btn"
            type="button"
            onClick={handleFitAll}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shadow-md border border-slate-200 transition-colors cursor-pointer"
            title="Fit All Journal Places in View"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            id="map-locate-me-btn"
            type="button"
            onClick={handleLocateMe}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shadow-md border border-slate-200 transition-colors cursor-pointer"
            title="Center on My Location"
          >
            <Navigation className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom Floating Active Place Pill on Map */}
        {selectedCluster && (
          <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-xl p-3 shadow-lg z-[400] animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
                  <MapPin className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 line-clamp-1">
                    {selectedCluster.location.name}
                  </h4>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {selectedCluster.entries.length}{' '}
                    {selectedCluster.entries.length === 1 ? 'reflection' : 'reflections'} written here
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSelectEntry(selectedCluster.entries[0])}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-[11px] font-semibold transition-colors shrink-0 cursor-pointer"
              >
                Open
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
