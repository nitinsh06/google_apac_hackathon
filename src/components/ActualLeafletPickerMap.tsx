import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

interface ActualLeafletPickerMapProps {
  position: { lat: number; lng: number };
  placeName?: string;
  onPositionChange: (newPos: { lat: number; lng: number }, shouldReverseGeocode?: boolean) => void;
}

export const ActualLeafletPickerMap: React.FC<ActualLeafletPickerMapProps> = ({
  position,
  placeName,
  onPositionChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const prevPosRef = useRef(position);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [position.lat, position.lng],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });

    // Clean, modern Voyager street tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    // Zoom control at bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Custom Draggable Pin Icon
    const customIcon = L.divIcon({
      className: 'picker-draggable-marker',
      html: `
        <div class="relative cursor-grab active:cursor-grabbing transform -translate-x-1/2 -translate-y-full">
          <div class="w-9 h-9 rounded-full bg-blue-600 shadow-xl border-2 border-white flex items-center justify-center text-white ring-4 ring-blue-400/30">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 7.2c0 7.3-8 11.8-8 11.8z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <div class="w-2 h-2 bg-blue-700 rotate-45 mx-auto -mt-1 rounded-xs"></div>
        </div>
      `,
      iconSize: [36, 42],
      iconAnchor: [18, 42],
    });

    const marker = L.marker([position.lat, position.lng], {
      icon: customIcon,
      draggable: true,
    }).addTo(map);

    // Drag events
    marker.on('drag', () => {
      const latlng = marker.getLatLng();
      onPositionChange(
        {
          lat: Number(latlng.lat.toFixed(6)),
          lng: Number(latlng.lng.toFixed(6)),
        },
        false
      );
    });

    marker.on('dragend', () => {
      const latlng = marker.getLatLng();
      onPositionChange(
        {
          lat: Number(latlng.lat.toFixed(6)),
          lng: Number(latlng.lng.toFixed(6)),
        },
        true
      );
    });

    // Map click to reposition pin
    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(6));
      const lng = Number(e.latlng.lng.toFixed(6));
      marker.setLatLng([lat, lng]);
      onPositionChange({ lat, lng }, true);
    });

    mapRef.current = map;
    markerRef.current = marker;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Update marker & pan when external position changes
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    const prev = prevPosRef.current;
    if (
      Math.abs(prev.lat - position.lat) > 0.0001 ||
      Math.abs(prev.lng - position.lng) > 0.0001
    ) {
      marker.setLatLng([position.lat, position.lng]);
      map.panTo([position.lat, position.lng], { animate: true });
      prevPosRef.current = position;
    }
  }, [position]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full z-0 bg-slate-100" />
      {/* Instructional helper chip */}
      <div className="absolute top-2 left-2 z-[400] bg-white/90 backdrop-blur-xs border border-slate-200/80 px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-700 shadow-2xs pointer-events-none flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
        <span>Click map or drag pin to adjust location</span>
      </div>
    </div>
  );
};
