import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  APILoadingStatus,
  Map as GoogleMap,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { AlertCircle, KeyRound, MapPin, Plus } from 'lucide-react';
import { categoryStyle, groupPlaces, reflectionCount } from '../lib/places.ts';
import type { MapPlace, PinGroup } from '../lib/places.ts';
import { categoryIcon } from './CoverTile.tsx';

export type MapTypeId = 'roadmap' | 'satellite';

export const MAP_TYPES: Record<MapTypeId, { label: string; googleId: string; backdrop: string }> = {
  roadmap: { label: 'Map', googleId: 'roadmap', backdrop: '#e8eaed' },
  satellite: { label: 'Satellite', googleId: 'hybrid', backdrop: '#0b1a2b' },
};

export interface Coords {
  lat: number;
  lng: number;
}

interface PlacesMapProps {
  places: MapPlace[];
  selectedPlaceId: string | null;
  onSelectPlace: (placeId: string | null) => void;
  /** Armed by the "Drop a pin" control; the next map click becomes a new pin. */
  dropMode: boolean;
  onDropPin: (coords: Coords) => void;
  pendingPin: Coords | null;
  userLocation: Coords | null;
  mapType: MapTypeId;
  /** Pixels the bottom sheet covers, so framing keeps pins above it. */
  bottomInset: number;
  /** Increment to re-frame every pin. */
  fitTrigger: number;
}

/** Imperative handle so the surrounding HUD can drive the camera. */
export interface PlacesMapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
}

const MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || 'DEMO_MAP_ID';
const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';
const DEMO_KEY_URL =
  'https://mapsplatform.google.com/maps-demo-key?utm_campaign=gmp_mcp_codeassist_v1_aistudio';

const CLUSTER_SPLIT_ZOOM = 17;
const FRAMED_MAX_ZOOM = 15;
/** Height of the floating search bar, which also masks the top of the map. */
const TOP_CHROME = 104;

/**
 * How far south of a pin the map centre must sit for that pin to land in the
 * middle of the strip between the search bar and the bottom sheet.
 */
const liftFor = (bottomInset: number): number => Math.max(0, (bottomInset - TOP_CHROME) / 2);

// ── Pin ───────────────────────────────────────────────────────────────────

const PlacePin: React.FC<{ group: PinGroup; isSelected: boolean; index: number }> = ({
  group,
  isSelected,
  index,
}) => {
  const style = categoryStyle(group.category);
  const Icon = categoryIcon(group.category);
  const stacked = group.entryCount > 1;

  const label =
    group.places.length === 1
      ? group.places[0].location.name
      : `${group.places.length} places · ${reflectionCount(group.entryCount)}`;

  return (
    <div
      className={`jm-pin${isSelected ? ' is-selected' : ''}${group.isSample ? ' is-sample' : ''}`}
    >
      <div className="jm-pin__body" style={{ animationDelay: `${Math.min(index * 26, 260)}ms` }}>
        {stacked && (
          <>
            <span className="jm-pin__sheet jm-pin__sheet--b" />
            <span className="jm-pin__sheet jm-pin__sheet--a" />
          </>
        )}
        <span
          className="jm-pin__tile"
          style={{ backgroundImage: `linear-gradient(140deg, ${style.from}, ${style.to})` }}
        >
          <Icon className="jm-pin__glyph" />
        </span>
        <span className="jm-pin__notch" />
        {stacked && <span className="jm-pin__count">{group.entryCount}</span>}
      </div>
      <span className="jm-pin__label">{label}</span>
    </div>
  );
};

// ── Camera + markers, inside the map's context ────────────────────────────

interface MapBrainProps extends PlacesMapProps {
  groups: PinGroup[];
  mapRef: React.MutableRefObject<google.maps.Map | null>;
}

const MapBrain: React.FC<MapBrainProps> = ({
  groups,
  places,
  selectedPlaceId,
  onSelectPlace,
  pendingPin,
  userLocation,
  bottomInset,
  fitTrigger,
  mapRef,
}) => {
  const map = useMap();
  // AdvancedMarkerElement only exists once the marker library has loaded; on a
  // failed key it never does, and rendering markers anyway throws.
  const markerLibrary = useMapsLibrary('marker');

  // Live values for callbacks and deferred camera moves.
  const live = useRef({ places, bottomInset });
  live.current = { places, bottomInset };

  const placesKey = useMemo(() => places.map((place) => place.id).join('|'), [places]);

  const paddingFor = useCallback(
    (mapInstance: google.maps.Map): google.maps.Padding => {
      const width = mapInstance.getDiv()?.clientWidth ?? 0;
      // Narrow viewports cannot spare 48px a side and still fit places on
      // opposite sides of the world.
      const gutter = width > 0 && width < 600 ? 20 : 48;
      return {
        top: TOP_CHROME,
        bottom: live.current.bottomInset + gutter,
        left: gutter,
        right: gutter,
      };
    },
    []
  );

  /** Centre `target` so it sits in the strip the sheet leaves visible. */
  const panWithLift = useCallback(
    (mapInstance: google.maps.Map, target: Coords, zoom: number) => {
      mapInstance.setZoom(zoom);
      const projection = mapInstance.getProjection();
      if (!projection) {
        mapInstance.panTo(target);
        return;
      }
      const world = projection.fromLatLngToPoint(new google.maps.LatLng(target.lat, target.lng));
      if (!world) {
        mapInstance.panTo(target);
        return;
      }
      const shifted = new google.maps.Point(
        world.x,
        world.y + liftFor(live.current.bottomInset) / 2 ** zoom
      );
      const lifted = projection.fromPointToLatLng(shifted);
      mapInstance.panTo(lifted ?? target);
    },
    []
  );

  React.useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);

  // Frame everything on load, when the visible set changes, or on demand.
  React.useEffect(() => {
    if (!map) return;
    const all = live.current.places;
    if (all.length === 0) return;

    const timer = window.setTimeout(() => {
      const bounds = new google.maps.LatLngBounds();
      all.forEach((place) => bounds.extend({ lat: place.location.lat, lng: place.location.lng }));
      map.fitBounds(bounds, paddingFor(map));
      // A single place (or several a few metres apart) would otherwise snap to
      // maximum zoom.
      google.maps.event.addListenerOnce(map, 'idle', () => {
        const zoom = map.getZoom();
        if (typeof zoom === 'number' && zoom > FRAMED_MAX_ZOOM) map.setZoom(FRAMED_MAX_ZOOM);
      });
    }, 60);

    return () => window.clearTimeout(timer);
  }, [map, placesKey, fitTrigger, paddingFor]);

  // Ease to the place the sheet is showing. Deferred a frame so the sheet has
  // resized to its new contents before we measure it.
  React.useEffect(() => {
    if (!map || !selectedPlaceId) return;
    const timer = window.setTimeout(() => {
      const place = live.current.places.find((candidate) => candidate.id === selectedPlaceId);
      if (!place) return;
      panWithLift(
        map,
        { lat: place.location.lat, lng: place.location.lng },
        Math.max(map.getZoom() ?? 2, FRAMED_MAX_ZOOM)
      );
    }, 110);
    return () => window.clearTimeout(timer);
  }, [map, selectedPlaceId, panWithLift]);

  React.useEffect(() => {
    if (!map || !pendingPin) return;
    const timer = window.setTimeout(() => {
      panWithLift(map, pendingPin, Math.max(map.getZoom() ?? 2, 14));
    }, 110);
    return () => window.clearTimeout(timer);
  }, [map, pendingPin, panWithLift]);

  const handleGroupClick = useCallback(
    (group: PinGroup) => {
      const busiest = [...group.places].sort((a, b) => b.entries.length - a.entries.length)[0];
      const zoom = map?.getZoom() ?? 2;

      // A merged pin behaves like a photo cluster: the first tap opens it up.
      if (map && group.places.length > 1 && zoom < CLUSTER_SPLIT_ZOOM) {
        const bounds = new google.maps.LatLngBounds();
        group.places.forEach((place) =>
          bounds.extend({ lat: place.location.lat, lng: place.location.lng })
        );
        map.fitBounds(bounds, paddingFor(map));
        google.maps.event.addListenerOnce(map, 'idle', () => {
          const next = map.getZoom();
          if (typeof next === 'number' && next > CLUSTER_SPLIT_ZOOM) map.setZoom(CLUSTER_SPLIT_ZOOM);
        });
        return;
      }

      onSelectPlace(busiest.id);
    },
    [map, onSelectPlace, paddingFor]
  );

  if (!map || !markerLibrary) return null;

  return (
    <>
      {groups.map((group, index) => {
        const isSelected = Boolean(
          selectedPlaceId && group.places.some((place) => place.id === selectedPlaceId)
        );
        return (
          <AdvancedMarker
            key={group.id}
            position={{ lat: group.lat, lng: group.lng }}
            zIndex={isSelected ? 1000 : index}
            onClick={() => handleGroupClick(group)}
          >
            <PlacePin group={group} isSelected={isSelected} index={index} />
          </AdvancedMarker>
        );
      })}

      {pendingPin && (
        <AdvancedMarker position={pendingPin} zIndex={1200} clickable={false}>
          <div className="jm-pin is-pending">
            <div className="jm-pin__body">
              <span
                className="jm-pin__tile"
                style={{ backgroundImage: 'linear-gradient(140deg, #0f766e, #2dd4bf)' }}
              >
                <Plus className="jm-pin__glyph" />
              </span>
              <span className="jm-pin__notch" />
            </div>
          </div>
        </AdvancedMarker>
      )}

      {userLocation && (
        <AdvancedMarker
          position={userLocation}
          anchorLeft="-50%"
          anchorTop="-50%"
          clickable={false}
        >
          <span className="jm-here">
            <span className="jm-here__pulse" />
            <span className="jm-here__dot" />
          </span>
        </AdvancedMarker>
      )}
    </>
  );
};

// ── Loading / failure surface ─────────────────────────────────────────────

const MapNotice: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}> = ({ icon, title, children }) => (
  <div className="absolute inset-0 z-[300] flex items-center justify-center bg-slate-100 p-6">
    <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-lg">
      <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
        {icon}
      </span>
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <div className="mt-1.5 text-xs leading-relaxed text-slate-600">{children}</div>
    </div>
  </div>
);

class MapErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Places map failed to render:', error);
  }

  render() {
    if (this.state.failed) {
      return (
        <MapNotice icon={<AlertCircle className="h-5 w-5" />} title="The map stopped responding">
          Google Maps could not finish loading. Check the API key and its restrictions, then
          reload the page.
        </MapNotice>
      );
    }
    return this.props.children;
  }
}

const ApiStatusGate: React.FC = () => {
  const status = useApiLoadingStatus();

  if (status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <MapNotice icon={<KeyRound className="h-5 w-5" />} title="Google Maps rejected this key">
        Check that <code className="font-mono text-[11px]">VITE_GOOGLE_MAPS_API_KEY</code> is valid,
        that billing is enabled, and that the key allows this origin and the Maps JavaScript API.
      </MapNotice>
    );
  }

  if (status === APILoadingStatus.FAILED) {
    return (
      <MapNotice icon={<AlertCircle className="h-5 w-5" />} title="Could not load Google Maps">
        The Maps JavaScript API did not load. Check your network connection and reload the page.
      </MapNotice>
    );
  }

  return null;
};

// ── Public component ──────────────────────────────────────────────────────

export const PlacesMap = forwardRef<PlacesMapHandle, PlacesMapProps>(function PlacesMap(props, ref) {
  const { places, dropMode, onDropPin, onSelectPlace, mapType } = props;

  const mapRef = useRef<google.maps.Map | null>(null);
  const [zoom, setZoom] = useState(2);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 2) + 1),
      zoomOut: () => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 2) - 1),
    }),
    []
  );

  const groups = useMemo(() => groupPlaces(places, zoom), [places, zoom]);
  const style = MAP_TYPES[mapType] ?? MAP_TYPES.roadmap;

  if (!API_KEY) {
    return (
      <div className="absolute inset-0" style={{ backgroundColor: style.backdrop }}>
        <MapNotice icon={<MapPin className="h-5 w-5" />} title="Add a Google Maps API key">
          Set <code className="font-mono text-[11px]">VITE_GOOGLE_MAPS_API_KEY</code> in your{' '}
          <code className="font-mono text-[11px]">.env</code> and restart the dev server. For
          prototyping you can grab a{' '}
          <a
            href={DEMO_KEY_URL}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-800"
          >
            free Maps demo key
          </a>
          .
        </MapNotice>
      </div>
    );
  }

  return (
    <MapErrorBoundary>
      <APIProvider apiKey={API_KEY} libraries={['marker']}>
        <GoogleMap
          mapId={MAP_ID}
          className="absolute inset-0 h-full w-full"
          style={{ backgroundColor: style.backdrop }}
          defaultCenter={{ lat: 20, lng: 6 }}
          defaultZoom={2}
          minZoom={1}
          mapTypeId={style.googleId}
          disableDefaultUI
          clickableIcons={false}
          gestureHandling="greedy"
          draggableCursor={dropMode ? 'crosshair' : undefined}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          onIdle={(event) => {
            const next = event.map.getZoom();
            if (typeof next === 'number') setZoom(next);
          }}
          onClick={(event) => {
            const latLng = event.detail.latLng;
            if (!dropMode) {
              onSelectPlace(null);
              return;
            }
            if (!latLng) return;
            onDropPin({
              lat: Number(latLng.lat.toFixed(5)),
              lng: Number(latLng.lng.toFixed(5)),
            });
          }}
        >
          <MapBrain {...props} groups={groups} mapRef={mapRef} />
        </GoogleMap>
        <ApiStatusGate />
      </APIProvider>
    </MapErrorBoundary>
  );
});
