import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { Layers, MapPin, Plus, Navigation } from 'lucide-react';
import type { JournalEntry, JournalLocation } from '../types.ts';

export interface LocationCluster {
  id: string;
  location: JournalLocation;
  entries: JournalEntry[];
  isSample?: boolean;
}

interface ActualLeafletPlacesMapProps {
  clusters: LocationCluster[];
  selectedCluster: LocationCluster | null;
  onSelectCluster: (cluster: LocationCluster) => void;
  onSelectEntry: (entry: JournalEntry) => void;
  onNewEntryAtLocation?: (location: JournalLocation) => void;
  targetCamera: { lat: number; lng: number } | null;
  fitTrigger: number;
  userLocation: { lat: number; lng: number } | null;
}

// Curated inspiration spots shown when no user entries have locations yet
export const INSPIRATION_SPOTS: LocationCluster[] = [
  {
    id: 'sample-sf',
    location: {
      name: 'Golden Gate Park',
      address: 'San Francisco, CA, USA',
      lat: 37.7694,
      lng: -122.4862,
    },
    entries: [
      {
        id: 'sample-entry-1',
        userId: 'sample-user',
        title: 'Morning Fog & Reflection',
        category: 'Mindfulness',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        turns: [
          {
            id: 't-1',
            role: 'user',
            text: 'Sitting quietly among the redwoods as the morning coastal fog rolls in. Feeling grounded and grateful for fresh perspective.',
            timestamp: new Date().toISOString(),
          },
          {
            id: 't-2',
            role: 'model',
            text: 'The stillness of coastal mornings offers a sanctuary for clarity. What thought brought you peace today?',
            timestamp: new Date().toISOString(),
          },
        ],
        summary: 'Morning quietude among coastal redwoods.',
        location: {
          name: 'Golden Gate Park',
          address: 'San Francisco, CA, USA',
          lat: 37.7694,
          lng: -122.4862,
        },
      },
    ],
    isSample: true,
  },
  {
    id: 'sample-nyc',
    location: {
      name: 'Central Park (Sheep Meadow)',
      address: 'New York, NY, USA',
      lat: 40.7711,
      lng: -73.9742,
    },
    entries: [
      {
        id: 'sample-entry-2',
        userId: 'sample-user',
        title: 'Brainstorming Among Greenery',
        category: 'Ideas',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        turns: [
          {
            id: 't-3',
            role: 'user',
            text: 'Outlining a creative roadmap under the afternoon sun in Central Park.',
            timestamp: new Date().toISOString(),
          },
        ],
        summary: 'Creative roadmap exploration outdoors.',
        location: {
          name: 'Central Park (Sheep Meadow)',
          address: 'New York, NY, USA',
          lat: 40.7711,
          lng: -73.9742,
        },
      },
    ],
    isSample: true,
  },
  {
    id: 'sample-kyoto',
    location: {
      name: 'Arashiyama Bamboo Grove',
      address: 'Kyoto, Japan',
      lat: 35.0169,
      lng: 135.6713,
    },
    entries: [
      {
        id: 'sample-entry-3',
        userId: 'sample-user',
        title: 'Wind Through Bamboo Stalks',
        category: 'Gratitude',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        turns: [
          {
            id: 't-4',
            role: 'user',
            text: 'Listening to the gentle rustling sound of bamboo in the morning breeze.',
            timestamp: new Date().toISOString(),
          },
        ],
        summary: 'Sensory awareness and gratitude in Kyoto.',
        location: {
          name: 'Arashiyama Bamboo Grove',
          address: 'Kyoto, Japan',
          lat: 35.0169,
          lng: 135.6713,
        },
      },
    ],
    isSample: true,
  },
  {
    id: 'sample-paris',
    location: {
      name: 'Luxembourg Gardens',
      address: 'Paris, France',
      lat: 48.8462,
      lng: 2.3372,
    },
    entries: [
      {
        id: 'sample-entry-4',
        userId: 'sample-user',
        title: 'Café & Fountain Thoughts',
        category: 'Personal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        turns: [
          {
            id: 't-5',
            role: 'user',
            text: 'Writing reflections near the Medici Fountain on a sunny afternoon.',
            timestamp: new Date().toISOString(),
          },
        ],
        summary: 'Personal retrospective by the Medici Fountain.',
        location: {
          name: 'Luxembourg Gardens',
          address: 'Paris, France',
          lat: 48.8462,
          lng: 2.3372,
        },
      },
    ],
    isSample: true,
  },
];

export const ActualLeafletPlacesMap: React.FC<ActualLeafletPlacesMapProps> = ({
  clusters,
  selectedCluster,
  onSelectCluster,
  onSelectEntry,
  onNewEntryAtLocation,
  targetCamera,
  fitTrigger,
  userLocation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const userMarkerRef = useRef<L.Marker | null>(null);
  const tempDropMarkerRef = useRef<L.Marker | null>(null);
  const [activeTileStyle, setActiveTileStyle] = useState<'voyager' | 'osm' | 'light'>('voyager');

  // Use real clusters if available, otherwise display inspiration spots
  const effectiveClusters = clusters.length > 0 ? clusters : INSPIRATION_SPOTS;

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center on first pin or world view
    const initialCenter: [number, number] =
      effectiveClusters.length > 0
        ? [effectiveClusters[0].location.lat, effectiveClusters[0].location.lng]
        : [37.7749, -122.4194];

    const initialZoom = effectiveClusters.length > 1 ? 4 : 12;

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: false,
      attributionControl: false,
    });

    // High performance vector-like Voyager raster tiles
    const tileLayer = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        maxZoom: 19,
        subdomains: 'abcd',
      }
    ).addTo(map);

    (map as any)._customTileLayer = tileLayer;

    // Attribution
    L.control
      .attribution({
        prefix: false,
        position: 'bottomright',
      })
      .addAttribution(
        '&copy; <a href="https://carto.com/" target="_blank" rel="noreferrer">CARTO</a> · <a href="https://openstreetmap.org" target="_blank" rel="noreferrer">OSM</a>'
      )
      .addTo(map);

    // Zoom control at bottom right
    L.control
      .zoom({
        position: 'bottomright',
      })
      .addTo(map);

    // Click anywhere on map to drop a new interactive pin!
    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(5));
      const lng = Number(e.latlng.lng.toFixed(5));

      if (tempDropMarkerRef.current) {
        tempDropMarkerRef.current.remove();
        tempDropMarkerRef.current = null;
      }

      // Temporary drop pin icon
      const dropIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: `
          <div class="pin-drop-anim relative flex flex-col items-center cursor-pointer" style="width: 36px; height: 42px;">
            <div class="w-9 h-9 rounded-full bg-emerald-600 shadow-xl border-2 border-white flex items-center justify-center text-white ring-4 ring-emerald-400/30">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div class="w-2.5 h-2.5 bg-emerald-700 rotate-45 -mt-1 shadow-xs"></div>
          </div>
        `,
        iconSize: [36, 42],
        iconAnchor: [18, 42],
        popupAnchor: [0, -42],
      });

      const tempMarker = L.marker([lat, lng], {
        icon: dropIcon,
        title: 'Dropped Pin',
      }).addTo(map);

      tempDropMarkerRef.current = tempMarker;

      const popupDiv = document.createElement('div');
      popupDiv.className = 'p-3 space-y-2.5 min-w-[220px] max-w-[280px] text-slate-800 font-sans';
      popupDiv.innerHTML = `
        <div class="border-b border-slate-100 pb-1.5">
          <div class="flex items-center gap-1.5 text-emerald-700 font-bold text-xs">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 7.2c0 7.3-8 11.8-8 11.8z" />
            </svg>
            <span>Dropped Pin Point</span>
          </div>
          <p class="text-[11px] text-slate-500 font-mono mt-0.5">${lat}°, ${lng}°</p>
        </div>
        <p class="text-xs text-slate-600">Start a new reflection tagged at this exact location on your life map.</p>
        <button id="write-at-clicked-pin" class="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs">
          <span>+ Write Reflection Here</span>
        </button>
      `;

      popupDiv.querySelector('#write-at-clicked-pin')?.addEventListener('click', () => {
        if (onNewEntryAtLocation) {
          onNewEntryAtLocation({
            name: `Spot at ${lat.toFixed(3)}°, ${lng.toFixed(3)}°`,
            lat,
            lng,
          });
        }
      });

      tempMarker.bindPopup(popupDiv, { closeButton: true }).openPopup();
    });

    mapInstanceRef.current = map;

    // Multiple layout invalidation passes to guarantee immediate tile rendering
    const t1 = setTimeout(() => map.invalidateSize(), 50);
    const t2 = setTimeout(() => map.invalidateSize(), 250);
    const t3 = setTimeout(() => map.invalidateSize(), 700);

    const handleWindowResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleWindowResize);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('resize', handleWindowResize);
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update tile layer style
  const handleToggleTileStyle = useCallback((style: 'voyager' | 'osm' | 'light') => {
    setActiveTileStyle(style);
    const map = mapInstanceRef.current;
    if (!map) return;

    if ((map as any)._customTileLayer) {
      (map as any)._customTileLayer.remove();
    }

    let url = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    if (style === 'light') {
      url = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    } else if (style === 'osm') {
      url = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    }

    const newLayer = L.tileLayer(url, {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    (map as any)._customTileLayer = newLayer;
  }, []);

  // Update Markers & Popups whenever effectiveClusters change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear old markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    if (effectiveClusters.length === 0) return;

    effectiveClusters.forEach((cluster) => {
      const isSelected = selectedCluster?.id === cluster.id;
      const count = cluster.entries.length;

      // Pure CSS/SVG marker with tip anchored at coordinate
      const iconHtml = `
        <div class="pin-drop-anim relative flex flex-col items-center cursor-pointer group" style="width: 36px; height: 42px;">
          <div class="w-9 h-9 rounded-full ${
            cluster.isSample
              ? 'bg-amber-600 ring-2 ring-amber-300/60'
              : isSelected
              ? 'bg-blue-600 ring-4 ring-blue-300 scale-110 shadow-xl'
              : 'bg-blue-600 hover:bg-blue-700 shadow-lg'
          } border-2 border-white flex items-center justify-center text-white transition-all transform group-hover:scale-115">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 7.2c0 7.3-8 11.8-8 11.8z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            ${
              count > 1
                ? `<span class="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm">${count}</span>`
                : ''
            }
          </div>
          <div class="w-2.5 h-2.5 ${
            cluster.isSample ? 'bg-amber-700' : isSelected ? 'bg-blue-700' : 'bg-blue-700'
          } rotate-45 -mt-1 shadow-xs"></div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: iconHtml,
        iconSize: [36, 42],
        iconAnchor: [18, 42],
        popupAnchor: [0, -42],
      });

      const marker = L.marker([cluster.location.lat, cluster.location.lng], {
        icon: customIcon,
        title: `${cluster.location.name} (${count} reflections)`,
      }).addTo(map);

      // Tooltip on hover
      marker.bindTooltip(
        `<span class="font-semibold text-xs">${escapeHtml(cluster.location.name)}</span> (${count})`,
        { direction: 'top', offset: [0, -42] }
      );

      // Construct rich interactive popup DOM
      const popupContainer = document.createElement('div');
      popupContainer.className = 'p-3.5 space-y-3 min-w-[260px] max-w-[310px] text-slate-800 font-sans';

      // Header
      const headerDiv = document.createElement('div');
      headerDiv.className = 'border-b border-slate-100 pb-2.5';
      headerDiv.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <h4 class="font-bold text-sm text-slate-900 leading-snug truncate">${escapeHtml(
                cluster.location.name
              )}</h4>
              ${
                cluster.isSample
                  ? `<span class="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 rounded uppercase">Sample</span>`
                  : ''
              }
            </div>
            ${
              cluster.location.address
                ? `<p class="text-[11px] text-slate-500 truncate mt-0.5">${escapeHtml(
                    cluster.location.address
                  )}</p>`
                : `<p class="text-[11px] text-slate-400 font-mono mt-0.5">${cluster.location.lat.toFixed(
                    4
                  )}°, ${cluster.location.lng.toFixed(4)}°</p>`
            }
          </div>
          <span class="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 rounded-full shrink-0 border border-blue-100">
            ${count} ${count === 1 ? 'Entry' : 'Entries'}
          </span>
        </div>
      `;
      popupContainer.appendChild(headerDiv);

      // Entries list inside popup
      const entriesList = document.createElement('div');
      entriesList.className = 'space-y-2 max-h-44 overflow-y-auto pr-1';

      cluster.entries.forEach((entry) => {
        const item = document.createElement('div');
        item.className =
          'p-2.5 rounded-lg bg-slate-50 hover:bg-blue-50/70 border border-slate-200/70 transition-colors cursor-pointer group';

        const category = entry.category || 'General';
        const dateStr = entry.createdAt
          ? new Date(entry.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })
          : '';
        const preview =
          entry.summary ||
          (entry.turns && entry.turns.length > 0 ? entry.turns[0].text : 'Journal reflection');

        item.innerHTML = `
          <div class="flex items-center justify-between gap-1 mb-1">
            <span class="text-[10px] font-bold px-1.5 py-0.2 rounded bg-white text-slate-600 border border-slate-200">
              ${escapeHtml(category)}
            </span>
            <span class="text-[10px] text-slate-400 font-medium">${escapeHtml(dateStr)}</span>
          </div>
          <h5 class="text-xs font-semibold text-slate-800 group-hover:text-blue-700 line-clamp-1">
            ${escapeHtml(entry.title || 'Untitled Reflection')}
          </h5>
          <p class="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
            ${escapeHtml(preview)}
          </p>
        `;

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectEntry(entry);
        });

        entriesList.appendChild(item);
      });
      popupContainer.appendChild(entriesList);

      // Actions Footer
      const footerDiv = document.createElement('div');
      footerDiv.className = 'pt-2 border-t border-slate-100 flex items-center justify-between gap-2';

      const writeBtn = document.createElement('button');
      writeBtn.type = 'button';
      writeBtn.className =
        'flex-1 py-1.5 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs';
      writeBtn.innerHTML = `
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span>Write Here</span>
      `;
      writeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onNewEntryAtLocation) {
          onNewEntryAtLocation(cluster.location);
        }
      });
      footerDiv.appendChild(writeBtn);
      popupContainer.appendChild(footerDiv);

      marker.bindPopup(popupContainer, {
        maxWidth: 320,
        className: 'custom-leaflet-popup',
      });

      marker.on('click', () => {
        onSelectCluster(cluster);
      });

      markersRef.current.set(cluster.id, marker);
    });

    // Automatically fit bounds to all visible markers so pins are immediately centered and seen!
    if (effectiveClusters.length > 0) {
      if (effectiveClusters.length === 1) {
        map.setView([effectiveClusters[0].location.lat, effectiveClusters[0].location.lng], 14);
      } else {
        const bounds = L.latLngBounds(
          effectiveClusters.map((c) => [c.location.lat, c.location.lng])
        );
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
      }
    }
  }, [effectiveClusters, onSelectCluster, onSelectEntry, onNewEntryAtLocation]);

  // Handle selectedCluster changes from sidebar or external clicks
  useEffect(() => {
    if (!selectedCluster) return;
    const map = mapInstanceRef.current;
    const marker = markersRef.current.get(selectedCluster.id);
    if (map && marker) {
      map.flyTo([selectedCluster.location.lat, selectedCluster.location.lng], 15, {
        duration: 1.2,
      });
      marker.openPopup();
    }
  }, [selectedCluster]);

  // Handle targetCamera movements
  useEffect(() => {
    if (!targetCamera) return;
    const map = mapInstanceRef.current;
    if (map) {
      map.flyTo([targetCamera.lat, targetCamera.lng], 15, {
        duration: 1.2,
      });
    }
  }, [targetCamera]);

  // Handle Fit All trigger
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || effectiveClusters.length === 0) return;

    if (effectiveClusters.length === 1) {
      map.setView([effectiveClusters[0].location.lat, effectiveClusters[0].location.lng], 14);
      return;
    }

    const bounds = L.latLngBounds(
      effectiveClusters.map((c) => [c.location.lat, c.location.lng])
    );
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
  }, [fitTrigger]);

  // Handle userLocation marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
      } else {
        const userIcon = L.divIcon({
          className: 'user-location-marker',
          html: `
            <div class="relative flex items-center justify-center">
              <div class="w-6 h-6 rounded-full bg-blue-500 opacity-30 animate-ping absolute"></div>
              <div class="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-md"></div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const marker = L.marker([userLocation.lat, userLocation.lng], {
          icon: userIcon,
          title: 'Your Current Location',
        })
          .addTo(map)
          .bindPopup('<div class="p-2 font-semibold text-xs text-slate-800">Your Current Location</div>');
        userMarkerRef.current = marker;
      }
      map.setView([userLocation.lat, userLocation.lng], 14);
    } else if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
  }, [userLocation]);

  return (
    <div className="relative w-full h-full min-h-[350px] md:min-h-full">
      {/* The Actual Leaflet Map Canvas */}
      <div
        id="actual-leaflet-map"
        ref={mapContainerRef}
        className="absolute inset-0 w-full h-full z-0 bg-slate-100"
      />

      {/* Top Left Floating Legend & Pin Count Pill */}
      <div className="absolute top-4 left-4 z-[400] flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/80 px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-2 text-xs font-semibold text-slate-800">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
          <span>
            {clusters.length > 0
              ? `${clusters.length} ${clusters.length === 1 ? 'Place' : 'Places'} Pinned`
              : '4 Sample Memory Spots Pinned'}
          </span>
        </div>

        {/* Tip: Click map to drop pin */}
        <div className="hidden lg:flex items-center gap-1.5 bg-white/90 backdrop-blur-xs border border-slate-200/80 px-2.5 py-1.5 rounded-xl shadow-xs text-[11px] text-slate-600 font-medium">
          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
          <span>Tip: Click anywhere on the map to drop a pin</span>
        </div>
      </div>

      {/* Layer Switcher HUD (Top Center) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] hidden sm:flex items-center bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl p-0.5 shadow-sm">
        <button
          type="button"
          onClick={() => handleToggleTileStyle('voyager')}
          className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTileStyle === 'voyager'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Street
        </button>
        <button
          type="button"
          onClick={() => handleToggleTileStyle('light')}
          className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTileStyle === 'light'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Minimal Light
        </button>
        <button
          type="button"
          onClick={() => handleToggleTileStyle('osm')}
          className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTileStyle === 'osm'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          OpenStreetMap
        </button>
      </div>
    </div>
  );
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
