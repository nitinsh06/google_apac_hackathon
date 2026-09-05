import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useApiLoadingStatus,
  APILoadingStatus,
  useMap,
  useMapsLibrary,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  X,
  Crosshair,
  Search,
  ExternalLink,
  Check,
  Trash2,
  AlertCircle,
  Navigation,
  Building2,
  Trees,
  Sparkles,
  Loader2,
  Compass,
} from 'lucide-react';
import type { JournalLocation } from '../types.ts';

// Source: Google Maps Platform Code Assist
// Grounded via @vis.gl/react-google-maps and Google Maps Platform Code Assist

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocation?: JournalLocation | null;
  onSaveLocation: (location: JournalLocation | null) => void;
}

const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 }; // San Francisco

interface LandmarkItem {
  name: string;
  category: 'Landmark' | 'Park' | 'Nature' | 'Cultural' | 'City';
  address: string;
  lat: number;
  lng: number;
}

const POPULAR_LANDMARKS: LandmarkItem[] = [
  { name: 'Golden Gate Park', category: 'Park', address: 'San Francisco, CA, USA', lat: 37.7694, lng: -122.4862 },
  { name: 'Golden Gate Bridge', category: 'Landmark', address: 'San Francisco, CA, USA', lat: 37.8199, lng: -122.4783 },
  { name: 'Central Park', category: 'Park', address: 'New York, NY, USA', lat: 40.7851, lng: -73.9683 },
  { name: 'Times Square', category: 'Landmark', address: 'New York, NY, USA', lat: 40.7589, lng: -73.9851 },
  { name: 'Brooklyn Bridge', category: 'Landmark', address: 'New York, NY, USA', lat: 40.7061, lng: -73.9969 },
  { name: 'Eiffel Tower', category: 'Landmark', address: 'Champ de Mars, Paris, France', lat: 48.8584, lng: 2.2945 },
  { name: 'Louvre Museum', category: 'Cultural', address: 'Rue de Rivoli, Paris, France', lat: 48.8606, lng: 2.3376 },
  { name: 'Montmartre & Sacré-Cœur', category: 'Cultural', address: 'Paris, France', lat: 48.8867, lng: 2.3431 },
  { name: 'Kyoto Imperial Palace', category: 'Cultural', address: 'Kyoto, Japan', lat: 35.0254, lng: 135.7621 },
  { name: 'Fushimi Inari-taisha', category: 'Cultural', address: 'Kyoto, Japan', lat: 34.9671, lng: 135.7727 },
  { name: 'Arashiyama Bamboo Grove', category: 'Nature', address: 'Kyoto, Japan', lat: 35.0170, lng: 135.6713 },
  { name: 'Kiyomizu-dera', category: 'Cultural', address: 'Kyoto, Japan', lat: 34.9949, lng: 135.7850 },
  { name: 'Tokyo Skytree', category: 'Landmark', address: 'Oshiage, Sumida, Tokyo, Japan', lat: 35.7101, lng: 139.8107 },
  { name: 'Shinjuku Gyoen National Garden', category: 'Park', address: 'Tokyo, Japan', lat: 35.6852, lng: 139.7101 },
  { name: 'Meiji Jingu Shrine', category: 'Cultural', address: 'Shibuya, Tokyo, Japan', lat: 35.6764, lng: 139.6993 },
  { name: 'Senso-ji Temple', category: 'Cultural', address: 'Asakusa, Tokyo, Japan', lat: 35.7148, lng: 139.7967 },
  { name: 'Mount Fuji', category: 'Nature', address: 'Honshu, Japan', lat: 35.3606, lng: 138.7278 },
  { name: 'Big Ben & Westminster', category: 'Landmark', address: 'London, England, UK', lat: 51.5007, lng: -0.1246 },
  { name: 'Hyde Park', category: 'Park', address: 'London, England, UK', lat: 51.5073, lng: -0.1657 },
  { name: 'Tower Bridge', category: 'Landmark', address: 'London, England, UK', lat: 51.5055, lng: -0.0754 },
  { name: 'Colosseum', category: 'Cultural', address: 'Piazza del Colosseo, Rome, Italy', lat: 41.8902, lng: 12.4922 },
  { name: 'Villa Borghese', category: 'Park', address: 'Rome, Italy', lat: 41.9133, lng: 12.4883 },
  { name: 'Sagrada Família', category: 'Cultural', address: 'Barcelona, Catalonia, Spain', lat: 41.4036, lng: 2.1744 },
  { name: 'Park Güell', category: 'Park', address: 'Barcelona, Catalonia, Spain', lat: 41.4145, lng: 2.1527 },
  { name: 'Sydney Opera House', category: 'Landmark', address: 'Bennelong Point, Sydney, Australia', lat: -33.8568, lng: 151.2153 },
  { name: 'Bondi Beach', category: 'Nature', address: 'Sydney, New South Wales, Australia', lat: -33.8915, lng: 151.2767 },
  { name: 'Marina Bay Sands', category: 'Landmark', address: '10 Bayfront Ave, Singapore', lat: 1.2834, lng: 103.8607 },
  { name: 'Gardens by the Bay', category: 'Park', address: '18 Marina Gardens Dr, Singapore', lat: 1.2816, lng: 103.8636 },
  { name: 'Grand Canyon National Park', category: 'Nature', address: 'Arizona, USA', lat: 36.0544, lng: -112.1401 },
  { name: 'Yosemite National Park', category: 'Nature', address: 'California, USA', lat: 37.8651, lng: -119.5383 },
  { name: 'Yellowstone National Park', category: 'Nature', address: 'Wyoming, USA', lat: 44.4280, lng: -110.5885 },
  { name: 'Lake Louise', category: 'Nature', address: 'Banff National Park, Alberta, Canada', lat: 51.4254, lng: -116.1773 },
  { name: 'Niagara Falls', category: 'Nature', address: 'Ontario, Canada / New York, USA', lat: 43.0962, lng: -79.0377 },
  { name: 'Taj Mahal', category: 'Cultural', address: 'Dharmapuri, Forest Colony, Agra, India', lat: 27.1751, lng: 78.0421 },
  { name: 'Machu Picchu', category: 'Cultural', address: 'Cusco Region, Peru', lat: -13.1631, lng: -72.5450 },
  { name: 'Table Mountain', category: 'Nature', address: 'Cape Town, South Africa', lat: -33.9628, lng: 18.4098 },
  { name: 'Acropolis of Athens', category: 'Cultural', address: 'Athens, Greece', lat: 37.9715, lng: 23.7257 },
  { name: 'Stonehenge', category: 'Cultural', address: 'Salisbury, Wiltshire, UK', lat: 51.1789, lng: -1.8262 },
  { name: 'Griffith Observatory', category: 'Landmark', address: 'Los Angeles, CA, USA', lat: 34.1184, lng: -118.3004 },
  { name: 'Millennium Park (The Bean)', category: 'Park', address: 'Chicago, IL, USA', lat: 41.8826, lng: -87.6226 },
  { name: 'Muir Woods National Monument', category: 'Nature', address: 'Mill Valley, CA, USA', lat: 37.8970, lng: -122.5811 },
  { name: 'Victoria Peak', category: 'Nature', address: 'Hong Kong', lat: 22.2759, lng: 114.1455 },
  { name: 'Brandenburg Gate', category: 'Landmark', address: 'Berlin, Germany', lat: 52.5163, lng: 13.3777 },
  { name: 'English Garden', category: 'Park', address: 'Munich, Bavaria, Germany', lat: 48.1535, lng: 11.5956 },
  { name: 'Waikiki Beach', category: 'Nature', address: 'Honolulu, Oahu, Hawaii, USA', lat: 21.2766, lng: -157.8272 },
  { name: 'Burj Khalifa', category: 'Landmark', address: '1 Sheikh Mohammed bin Rashid Blvd, Dubai, UAE', lat: 25.1972, lng: 55.2744 },
];

const POPULAR_PRESETS = [
  { name: 'San Francisco, CA', address: 'San Francisco, California, USA', lat: 37.7749, lng: -122.4194 },
  { name: 'New York City, NY', address: 'New York, NY, USA', lat: 40.7128, lng: -74.006 },
  { name: 'Tokyo, Japan', address: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503 },
  { name: 'London, UK', address: 'London, England, UK', lat: 51.5074, lng: -0.1278 },
  { name: 'Paris, France', address: 'Paris, Île-de-France, France', lat: 48.8566, lng: 2.3522 },
  { name: 'Kyoto, Japan', address: 'Kyoto, Japan', lat: 35.0116, lng: 135.7681 },
];

/**
 * Helper to match coordinates to closest catalog landmark if within 2 km
 */
function findNearbyLandmark(lat: number, lng: number): LandmarkItem | null {
  let closest: LandmarkItem | null = null;
  let minDistanceKm = 2.0;

  for (const item of POPULAR_LANDMARKS) {
    const dLat = ((item.lat - lat) * Math.PI) / 180;
    const dLng = ((item.lng - lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat * Math.PI) / 180) *
        Math.cos((item.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = 6371 * c;
    if (distanceKm < minDistanceKm) {
      minDistanceKm = distanceKm;
      closest = item;
    }
  }
  return closest;
}

/**
 * Camera Controller that smoothly pans the map when position updates programmatically
 * (from search selection, preset clicks, or geolocation) without locking user manual dragging.
 */
const MapCameraController: React.FC<{ targetPosition: { lat: number; lng: number } }> = ({
  targetPosition,
}) => {
  const map = useMap();
  const prevTargetRef = useRef(targetPosition);

  useEffect(() => {
    if (!map) return;
    const prev = prevTargetRef.current;
    if (
      Math.abs(prev.lat - targetPosition.lat) > 0.0001 ||
      Math.abs(prev.lng - targetPosition.lng) > 0.0001
    ) {
      map.panTo(targetPosition);
      prevTargetRef.current = targetPosition;
    }
  }, [map, targetPosition]);

  return null;
};

/**
 * Place & Landmark Search Bar with Autocomplete Suggestions
 * Uses Places API (New) when Google Maps is available, with instant fallback
 * to a comprehensive worldwide landmark directory and coordinate parser.
 */
const LandmarkSearchBox: React.FC<{
  onSelectPlace: (place: { name: string; address?: string; lat: number; lng: number }) => void;
  isApiLoaded: boolean;
}> = ({ onSelectPlace, isApiLoaded }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [googleResults, setGoogleResults] = useState<
    Array<{
      id: string;
      name: string;
      address: string;
      place?: any;
      placeId?: string;
    }>
  >([]);

  const placesLib = useMapsLibrary('places');
  const geocodingLib = useMapsLibrary('geocoding');
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter curated landmarks instantly on substring match
  const filteredLandmarks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return POPULAR_LANDMARKS.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [query]);

  // Check if query is formatted as coordinate string (lat, lng)
  const parsedCoords = useMemo(() => {
    const trimmed = query.trim();
    const match = trimmed.match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[3]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
    return null;
  }, [query]);

  // Query Google Places Autocomplete API when available
  useEffect(() => {
    const q = query.trim();
    if (!placesLib || q.length < 2) {
      setGoogleResults([]);
      return;
    }

    let isCancelled = false;
    setIsSearching(true);

    const timeoutId = setTimeout(async () => {
      try {
        if (placesLib.AutocompleteSuggestion) {
          if (!sessionTokenRef.current && placesLib.AutocompleteSessionToken) {
            sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
          }
          const req: any = {
            input: q,
            sessionToken: sessionTokenRef.current,
          };
          const response = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
          if (!isCancelled && response?.suggestions) {
            const results = response.suggestions.map((s: any, idx: number) => {
              const mainText =
                s.placePrediction?.structuredFormat?.mainText?.text ||
                s.placePrediction?.text?.text ||
                `Place ${idx + 1}`;
              const secondaryText =
                s.placePrediction?.structuredFormat?.secondaryText?.text || '';
              return {
                id: s.placePrediction?.placeId || `sug-${idx}`,
                name: mainText,
                address: secondaryText,
                place: s.placePrediction?.toPlace ? s.placePrediction.toPlace() : null,
                placeId: s.placePrediction?.placeId,
              };
            });
            setGoogleResults(results);
          }
        } else if (placesLib.AutocompleteService) {
          const service = new placesLib.AutocompleteService();
          service.getPlacePredictions({ input: q }, (predictions) => {
            if (!isCancelled && predictions) {
              const results = predictions.map((p) => ({
                id: p.place_id,
                name: p.structured_formatting?.main_text || p.description,
                address: p.structured_formatting?.secondary_text || '',
                placeId: p.place_id,
              }));
              setGoogleResults(results);
            }
          });
        }
      } catch (err) {
        console.warn('Google Places suggestion error:', err);
      } finally {
        if (!isCancelled) setIsSearching(false);
      }
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [query, placesLib]);

  // Handle outside clicks to dismiss suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectLandmark = (item: LandmarkItem) => {
    onSelectPlace({
      name: item.name,
      address: item.address,
      lat: item.lat,
      lng: item.lng,
    });
    setQuery(item.name);
    setIsOpen(false);
  };

  const handleSelectGoogleResult = async (item: (typeof googleResults)[0]) => {
    setIsSearching(true);
    try {
      if (item.place) {
        await item.place.fetchFields({
          fields: ['location', 'displayName', 'formattedAddress'],
        });
        if (item.place.location) {
          const loc = item.place.location;
          const lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
          const lng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
          onSelectPlace({
            name: item.place.displayName || item.name,
            address: item.place.formattedAddress || item.address,
            lat: Number(lat.toFixed(6)),
            lng: Number(lng.toFixed(6)),
          });
          setQuery(item.name);
          setIsOpen(false);
          sessionTokenRef.current = null;
          return;
        }
      }

      if (geocodingLib && (item.placeId || item.name)) {
        const geocoder = new geocodingLib.Geocoder();
        const req = item.placeId
          ? { placeId: item.placeId }
          : { address: `${item.name} ${item.address}` };
        geocoder.geocode(req, (results) => {
          if (results && results[0]?.geometry?.location) {
            const loc = results[0].geometry.location;
            onSelectPlace({
              name: item.name,
              address: results[0].formatted_address || item.address,
              lat: Number(loc.lat().toFixed(6)),
              lng: Number(loc.lng().toFixed(6)),
            });
            setQuery(item.name);
            setIsOpen(false);
          }
        });
      }
    } catch (err) {
      console.error('Failed to resolve place coordinates:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectCoords = () => {
    if (parsedCoords) {
      onSelectPlace({
        name: `Coordinates (${parsedCoords.lat.toFixed(4)}, ${parsedCoords.lng.toFixed(4)})`,
        address: `${parsedCoords.lat}° N, ${parsedCoords.lng}° E`,
        lat: parsedCoords.lat,
        lng: parsedCoords.lng,
      });
      setIsOpen(false);
    }
  };

  const hasSuggestions =
    filteredLandmarks.length > 0 || googleResults.length > 0 || parsedCoords !== null;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
        <input
          id="landmark-search-input"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search landmark, park, or place (e.g. Central Park, Eiffel Tower, Kyoto...)"
          className="w-full bg-white border border-slate-300 hover:border-slate-400 focus:border-blue-500 rounded-xl pl-9 pr-9 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-xs transition-all font-medium"
        />
        {isSearching ? (
          <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin absolute right-3 top-3 pointer-events-none" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setIsOpen(false);
            }}
            className="absolute right-2.5 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && hasSuggestions && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {/* Coordinates match pill */}
          {parsedCoords && (
            <button
              type="button"
              onClick={handleSelectCoords}
              className="w-full px-3.5 py-2.5 text-left flex items-center gap-2.5 hover:bg-blue-50 border-b border-slate-100 transition-colors cursor-pointer"
            >
              <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <Navigation className="w-3.5 h-3.5" />
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold text-blue-900">Jump to Direct Coordinates</p>
                <p className="text-[11px] text-blue-600 font-mono">
                  {parsedCoords.lat.toFixed(6)}, {parsedCoords.lng.toFixed(6)}
                </p>
              </div>
            </button>
          )}

          {/* Google Places Results */}
          {googleResults.length > 0 && (
            <div>
              <div className="px-3 py-1 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Google Places Matches
              </div>
              {googleResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectGoogleResult(item)}
                  className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-semibold text-slate-800 truncate">{item.name}</p>
                    {item.address && (
                      <p className="text-[11px] text-slate-500 truncate">{item.address}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Landmark Catalog Results */}
          {filteredLandmarks.length > 0 && (
            <div>
              <div className="px-3 py-1 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Popular Landmarks & Reflection Sanctuaries
              </div>
              {filteredLandmarks.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => handleSelectLandmark(item)}
                  className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    {item.category === 'Park' ? (
                      <Trees className="w-3.5 h-3.5" />
                    ) : item.category === 'Cultural' ? (
                      <Sparkles className="w-3.5 h-3.5" />
                    ) : (
                      <Building2 className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="truncate flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-800 truncate">{item.name}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium shrink-0">
                        {item.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{item.address}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Inner Map Handler with free gesture dragging, marker dragging, and click-to-pin
 */
const InteractiveMapContent: React.FC<{
  position: { lat: number; lng: number };
  onPositionChange: (pos: { lat: number; lng: number }, shouldReverseGeocode?: boolean) => void;
  placeName?: string;
}> = ({ position, onPositionChange, placeName }) => {
  const status = useApiLoadingStatus();
  const [markerRef, marker] = useAdvancedMarkerRef();

  // Helper to extract coordinates safely from event or marker instance
  const extractCoords = useCallback(
    (e?: any): { lat: number; lng: number } | null => {
      if (e?.latLng) {
        const lat = typeof e.latLng.lat === 'function' ? e.latLng.lat() : Number(e.latLng.lat);
        const lng = typeof e.latLng.lng === 'function' ? e.latLng.lng() : Number(e.latLng.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
          return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
        }
      }
      if (marker && marker.position) {
        const pos: any = marker.position;
        const lat = typeof pos.lat === 'function' ? pos.lat() : Number(pos.lat);
        const lng = typeof pos.lng === 'function' ? pos.lng() : Number(pos.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
          return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
        }
      }
      return null;
    },
    [marker]
  );

  // Attach native Google Maps event listeners directly to marker for 100% reliable drag tracking
  useEffect(() => {
    if (!marker) return;

    const dragListener = marker.addListener('drag', (e: any) => {
      const coords = extractCoords(e);
      if (coords) {
        onPositionChange(coords, false);
      }
    });

    const dragEndListener = marker.addListener('dragend', (e: any) => {
      const coords = extractCoords(e);
      if (coords) {
        onPositionChange(coords, true);
      }
    });

    return () => {
      if (window.google?.maps?.event) {
        google.maps.event.removeListener(dragListener);
        google.maps.event.removeListener(dragEndListener);
      }
    };
  }, [marker, extractCoords, onPositionChange]);

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-slate-100 text-slate-600 p-6 text-center">
        <AlertCircle className="w-8 h-8 text-amber-500 mb-2" />
        <p className="text-xs font-semibold">Google Maps authentication failed or key is restricted.</p>
        <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
          Verify your API key or use the manual place name entry below.
        </p>
      </div>
    );
  }

  return (
    <Map
      defaultCenter={position}
      defaultZoom={14}
      mapId="DEMO_MAP_ID"
      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      onClick={(e) => {
        if (e.detail?.latLng) {
          onPositionChange({
            lat: Number(e.detail.latLng.lat.toFixed(6)),
            lng: Number(e.detail.latLng.lng.toFixed(6)),
          }, true);
        }
      }}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      disableDefaultUI={false}
      gestureHandling="greedy"
    >
      <MapCameraController targetPosition={position} />
      <AdvancedMarker
        ref={markerRef}
        position={position}
        draggable={true}
        title={placeName || 'Pinned Reflection Location (Drag to reposition)'}
        onDrag={(e) => {
          const coords = extractCoords(e);
          if (coords) {
            onPositionChange(coords, false);
          }
        }}
        onDragEnd={(e) => {
          const coords = extractCoords(e);
          if (coords) {
            onPositionChange(coords, true);
          }
        }}
      >
        <Pin background="#2563eb" glyphColor="#ffffff" borderColor="#1d4ed8" />
      </AdvancedMarker>
    </Map>
  );
};

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  currentLocation,
  onSaveLocation,
}) => {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(DEFAULT_CENTER);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Retrieve client API key from environment
  const mapsApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

  // Initialize modal state from currentLocation
  useEffect(() => {
    if (isOpen) {
      if (currentLocation) {
        setName(currentLocation.name);
        setAddress(currentLocation.address || '');
        setCoords({ lat: currentLocation.lat, lng: currentLocation.lng });
      } else {
        setName('');
        setAddress('');
        setCoords(DEFAULT_CENTER);
      }
      setGeoError(null);
      setIsGeocoding(false);
    }
  }, [isOpen, currentLocation]);

  // Position change handler with live coordinate updates and reverse geocoding on drag release / map click
  const handlePositionChange = useCallback(
    async (newPos: { lat: number; lng: number }, shouldReverseGeocode = false) => {
      setCoords(newPos);
      setGeoError(null);

      // Format clean directional coordinates string
      const latDir = newPos.lat >= 0 ? 'N' : 'S';
      const lngDir = newPos.lng >= 0 ? 'E' : 'W';
      const formattedCoords = `${Math.abs(newPos.lat).toFixed(4)}° ${latDir}, ${Math.abs(newPos.lng).toFixed(4)}° ${lngDir}`;

      if (shouldReverseGeocode) {
        setIsGeocoding(true);
        try {
          let resolved: { name?: string; address?: string } | null = null;

          // 1. Google Maps Geocoder API lookup
          if (typeof window !== 'undefined' && window.google?.maps?.Geocoder) {
            resolved = await new Promise((resolve) => {
              try {
                const geocoder = new window.google.maps.Geocoder();
                geocoder.geocode({ location: newPos }, (results, status) => {
                  if (status === 'OK' && results && results[0]) {
                    const top = results[0];
                    let foundName = '';
                    const poi = top.address_components?.find((c) =>
                      c.types.includes('point_of_interest') || c.types.includes('establishment')
                    );
                    const sublocality = top.address_components?.find((c) =>
                      c.types.includes('sublocality') || c.types.includes('neighborhood')
                    );
                    const locality = top.address_components?.find((c) => c.types.includes('locality'));
                    const route = top.address_components?.find((c) => c.types.includes('route'));

                    if (poi) {
                      foundName = poi.long_name;
                    } else if (sublocality && locality) {
                      foundName = `${sublocality.long_name}, ${locality.long_name}`;
                    } else if (route && locality) {
                      foundName = `${route.long_name}, ${locality.long_name}`;
                    } else if (locality) {
                      foundName = locality.long_name;
                    } else {
                      foundName = top.formatted_address.split(',')[0];
                    }

                    resolve({
                      name: foundName.trim() || 'Pinned Location',
                      address: top.formatted_address,
                    });
                  } else {
                    resolve(null);
                  }
                });
              } catch {
                resolve(null);
              }
            });
          }

          // 2. Catalog fallback (within 2km of famous landmarks)
          if (!resolved) {
            const nearby = findNearbyLandmark(newPos.lat, newPos.lng);
            if (nearby) {
              resolved = { name: nearby.name, address: nearby.address };
            }
          }

          // 3. Update form fields
          if (resolved) {
            if (resolved.name) setName(resolved.name);
            if (resolved.address) setAddress(resolved.address);
          } else {
            setName(`Pinned Location (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`);
            setAddress(formattedCoords);
          }
        } catch (err) {
          console.warn('Reverse geocoding error:', err);
          setName(`Pinned Location (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`);
          setAddress(formattedCoords);
        } finally {
          setIsGeocoding(false);
        }
      } else {
        // Live drag update without overwriting custom place name
        if (!address || address.includes('° N') || address.includes('° S') || address.includes('Pinned Location')) {
          setAddress(formattedCoords);
        }
      }
    },
    [address]
  );

  // Request browser geolocation with explicit user consent
  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }

    setGeoLoading(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const newCoords = { lat, lng };
        setCoords(newCoords);
        handlePositionChange(newCoords, true);
        setGeoLoading(false);
      },
      (err) => {
        console.warn('Geolocation permission error:', err);
        setGeoLoading(false);
        if (err.code === 1) {
          setGeoError('Location permission was denied. You can still search or enter a place name manually.');
        } else {
          setGeoError('Unable to retrieve current location.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [handlePositionChange]);

  // Handle Preset selection
  const handleSelectPreset = (preset: typeof POPULAR_PRESETS[0]) => {
    setName(preset.name);
    setAddress(preset.address);
    setCoords({ lat: preset.lat, lng: preset.lng });
    setGeoError(null);
  };

  // Handle place selection from Search Bar
  const handleSelectSearchedPlace = (place: {
    name: string;
    address?: string;
    lat: number;
    lng: number;
  }) => {
    setName(place.name);
    if (place.address) setAddress(place.address);
    setCoords({ lat: place.lat, lng: place.lng });
    setGeoError(null);
  };

  // Submit and save location to reflection
  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setGeoError('Please provide a place name or landmark for this reflection.');
      return;
    }

    const newLocation: JournalLocation = {
      name: trimmedName,
      address: address.trim() || undefined,
      lat: coords.lat,
      lng: coords.lng,
    };

    onSaveLocation(newLocation);
    onClose();
  };

  // Remove location from entry
  const handleRemove = () => {
    onSaveLocation(null);
    onClose();
  };

  if (!isOpen) return null;

  const modalBodyContent = (
    <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
      {/* Prominent Landmark / Place Search Bar */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-blue-600" />
            <span>Search Place or Landmark</span>
          </span>
          <span className="text-[11px] font-normal text-slate-400">
            Live autocomplete & coordinates
          </span>
        </label>
        <LandmarkSearchBox
          onSelectPlace={handleSelectSearchedPlace}
          isApiLoaded={Boolean(mapsApiKey)}
        />
      </div>

      {/* Quick Actions: Current Location & Interactive Guide */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button
          id="use-current-location-btn"
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={geoLoading}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs transition-colors border border-blue-200/60 cursor-pointer shadow-xs disabled:opacity-50"
        >
          <Crosshair className={`w-3.5 h-3.5 ${geoLoading ? 'animate-spin' : ''}`} />
          <span>{geoLoading ? 'Locating...' : 'Use My Current Location'}</span>
        </button>

        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Map & Marker are draggable · Click to pin</span>
        </div>
      </div>

      {/* Quick Presets */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
          Suggestions:
        </span>
        {POPULAR_PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => handleSelectPreset(p)}
            className="px-2.5 py-1 text-xs rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition-colors whitespace-nowrap cursor-pointer"
          >
            {p.name.split(',')[0]}
          </button>
        ))}
      </div>

      {/* Geolocation Error Alert if any */}
      {geoError && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>{geoError}</span>
        </div>
      )}

      {/* Interactive Google Map Container */}
      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative h-64 sm:h-72 w-full shadow-inner">
        {mapsApiKey ? (
          <InteractiveMapContent
            position={coords}
            placeName={name}
            onPositionChange={handlePositionChange}
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center bg-slate-50 text-slate-600">
            <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-2.5 shadow-xs">
              <Navigation className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Interactive Google Map Preview
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-3 leading-relaxed">
              Pin is positioned at coordinates{' '}
              <code className="px-1.5 py-0.5 bg-slate-200 rounded font-mono text-[11px] text-slate-800 font-semibold">
                {coords.lat}, {coords.lng}
              </code>
              . You can search landmarks or presets above. To load live vector tiles, connect your Google Maps API key or Maps Demo Key in{' '}
              <code className="text-blue-700 font-mono">.env</code>.
            </p>
            <a
              href="https://mapsplatform.google.com/maps-demo-key?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-semibold shadow-xs transition-colors"
            >
              <span>Get Zero-Cost Maps Demo Key</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          </div>
        )}

        {/* Floating Coordinate & Instruction Pill on top of map */}
        <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-xs border border-slate-200 px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold text-slate-700 shadow-xs pointer-events-none flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
          <span>Lat: {coords.lat.toFixed(6)}, Lng: {coords.lng.toFixed(6)}</span>
        </div>
      </div>

      {/* Dedicated Geographic Coordinates Fields */}
      <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Compass className="w-3.5 h-3.5 text-blue-600" />
            <span>Pin Coordinates</span>
            {isGeocoding && (
              <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                <span>Resolving address...</span>
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
            {coords.lat >= 0 ? `${coords.lat.toFixed(4)}° N` : `${Math.abs(coords.lat).toFixed(4)}° S`},{' '}
            {coords.lng >= 0 ? `${coords.lng.toFixed(4)}° E` : `${Math.abs(coords.lng).toFixed(4)}° W`}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label
              htmlFor="latitude-input"
              className="block text-[11px] font-medium text-slate-600 mb-1 flex items-center justify-between"
            >
              <span>Latitude</span>
              <span className="text-[10px] text-slate-400 font-mono">-90° to 90°</span>
            </label>
            <input
              id="latitude-input"
              type="number"
              step="0.000001"
              min="-90"
              max="90"
              value={coords.lat}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) {
                  const clamped = Math.max(-90, Math.min(90, val));
                  const updated = { ...coords, lat: clamped };
                  setCoords(updated);
                }
              }}
              onBlur={() => handlePositionChange(coords, true)}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs font-medium"
            />
          </div>

          <div>
            <label
              htmlFor="longitude-input"
              className="block text-[11px] font-medium text-slate-600 mb-1 flex items-center justify-between"
            >
              <span>Longitude</span>
              <span className="text-[10px] text-slate-400 font-mono">-180° to 180°</span>
            </label>
            <input
              id="longitude-input"
              type="number"
              step="0.000001"
              min="-180"
              max="180"
              value={coords.lng}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) {
                  const clamped = Math.max(-180, Math.min(180, val));
                  const updated = { ...coords, lng: clamped };
                  setCoords(updated);
                }
              }}
              onBlur={() => handlePositionChange(coords, true)}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs font-medium"
            />
          </div>
        </div>
      </div>

      {/* Place Details Input Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="location-name-input"
            className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between"
          >
            <span>
              Place / Landmark Name <span className="text-blue-600">*</span>
            </span>
            {isGeocoding && <span className="text-[10px] text-blue-500 font-normal">Updating...</span>}
          </label>
          <div className="relative">
            <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              id="location-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Golden Gate Park, Tokyo Skytree..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="location-address-input"
            className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between"
          >
            <span>
              Address / Contextual Note <span className="text-slate-400 font-normal">(Optional)</span>
            </span>
            {isGeocoding && <span className="text-[10px] text-blue-500 font-normal">Resolving...</span>}
          </label>
          <input
            id="location-address-input"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g., San Francisco, CA or Quiet study nook"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>
    </div>
  );

  return (
    <div
      id="location-picker-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="location-picker-modal-content"
        className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden text-slate-800 flex flex-col my-auto"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <MapPin className="w-4 h-4 stroke-[2.4]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Pin Location to Reflection</h3>
              <p className="text-[11px] text-slate-500">
                Ground your thoughts in physical space. Search landmark, drag map or pin to adjust.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wrap in APIProvider if API Key is configured so Autocomplete & Map share context */}
        {mapsApiKey ? (
          <APIProvider apiKey={mapsApiKey}>{modalBodyContent}</APIProvider>
        ) : (
          modalBodyContent
        )}

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between gap-3">
          {currentLocation ? (
            <button
              id="remove-location-btn"
              type="button"
              onClick={handleRemove}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove Pin</span>
            </button>
          ) : (
            <div className="text-[11px] text-slate-400">
              * Saved directly to your isolated Firestore entry.
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="save-location-pin-btn"
              type="button"
              onClick={handleSave}
              disabled={!name.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Pin to Reflection</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

