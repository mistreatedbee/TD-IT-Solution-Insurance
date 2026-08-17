/**
 * Lightweight Leaflet map for customer web dashboard — Phase 5.
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface ProtectionMapPin {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
}

export interface ProtectionMapCanvasProps {
  pins: ProtectionMapPin[];
  selectedId?: string | null;
  onSelectPin?: (id: string) => void;
  height?: number;
}

const DEFAULT_CENTER: L.LatLngExpression = [-26.2041, 28.0473];

export function ProtectionMapCanvas({
  pins,
  selectedId,
  onSelectPin,
  height = 400,
}: ProtectionMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(DEFAULT_CENTER, 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (pins.length === 0) {
      map.setView(DEFAULT_CENTER, 11);
      return;
    }

    const bounds = L.latLngBounds([]);
    pins.forEach((pin) => {
      const isSelected = pin.id === selectedId;
      const marker = L.circleMarker([pin.latitude, pin.longitude], {
        radius: isSelected ? 10 : 8,
        color: isSelected ? '#0f2d52' : '#1e4d8c',
        weight: 2,
        fillColor: isSelected ? '#c9a227' : '#1e4d8c',
        fillOpacity: 0.9,
      });
      marker.bindTooltip(pin.title, { permanent: isSelected, direction: 'top' });
      marker.on('click', () => onSelectPin?.(pin.id));
      marker.addTo(map);
      markersRef.current.push(marker);
      bounds.extend([pin.latitude, pin.longitude]);

      if (pin.id === selectedId) {
        marker.openTooltip();
      }
    });

    if (selectedId) {
      const selected = pins.find((pin) => pin.id === selectedId);
      if (selected) {
        map.setView([selected.latitude, selected.longitude], 14, { animate: true });
        return;
      }
    }

    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
  }, [pins, selectedId, onSelectPin]);

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="w-full bg-slate-100"
      role="application"
      aria-label="Protection map showing last known asset locations"
    />
  );
}
