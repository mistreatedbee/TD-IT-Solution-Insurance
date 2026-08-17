import React, { Component, useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { MapPlaceholder } from '../recovery/MapPlaceholder';

export interface MapAssetPin {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
}

export interface MapTrailCoordinate {
  latitude: number;
  longitude: number;
}

export type ProtectionMapType = 'standard' | 'satellite';

export interface ProtectionMapViewProps {
  pins: MapAssetPin[];
  selectedId?: string | null;
  onSelectPin?: (id: string) => void;
  height?: number;
  fullScreen?: boolean;
  mapType?: ProtectionMapType;
  trailCoordinates?: MapTrailCoordinate[];
  mapEdgePadding?: { top: number; right: number; bottom: number; left: number };
  recordedAt?: string | null;
  emptyMessage?: string;
  /** When true, embedded previews still render the native map (default region) with zero pins. */
  showMapWhenEmpty?: boolean;
}

interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

type MapsModule = {
  default: React.ComponentType<Record<string, unknown>> & {
    fitToCoordinates?: (
      coordinates: { latitude: number; longitude: number }[],
      options: { edgePadding: Record<string, number>; animated: boolean },
    ) => void;
    animateToRegion?: (region: MapRegion, duration: number) => void;
  };
  Marker: React.ComponentType<Record<string, unknown>>;
  Polyline: React.ComponentType<Record<string, unknown>>;
};

const DEFAULT_REGION: MapRegion = {
  latitude: -26.2041,
  longitude: 28.0473,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

function loadMapsModule(): MapsModule | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('react-native-maps') as MapsModule;
  } catch {
    return null;
  }
}

function regionForPin(pin: MapAssetPin): MapRegion {
  return {
    latitude: pin.latitude,
    longitude: pin.longitude,
    latitudeDelta: 0.012,
    longitudeDelta: 0.012,
  };
}

class MapRenderBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function NativeProtectionMap({
  pins,
  selectedId,
  onSelectPin,
  height,
  fullScreen,
  mapType = 'standard',
  trailCoordinates = [],
  mapEdgePadding,
  recordedAt,
  emptyMessage,
}: ProtectionMapViewProps) {
  const mapsModule = loadMapsModule();
  const mapRef = useRef<MapsModule['default']>(null);
  const selected = pins.find((pin) => pin.id === selectedId) ?? pins[0] ?? null;

  const initialRegion = useMemo(() => {
    if (selected) return regionForPin(selected);
    return DEFAULT_REGION;
  }, [selected]);

  useEffect(() => {
    if (!mapsModule || pins.length === 0) return;

    if (selected) {
      mapRef.current?.animateToRegion?.(regionForPin(selected), 320);
      return;
    }

    if (pins.length === 1) {
      mapRef.current?.animateToRegion?.(regionForPin(pins[0]!), 320);
      return;
    }

    mapRef.current?.fitToCoordinates?.(
      pins.map((pin) => ({ latitude: pin.latitude, longitude: pin.longitude })),
      {
        edgePadding: mapEdgePadding ?? { top: 120, right: 48, bottom: 220, left: 48 },
        animated: true,
      },
    );
  }, [mapsModule, pins, selectedId, selected, mapEdgePadding]);

  const placeholder = (
    <MapPlaceholder
      latitude={selected?.latitude}
      longitude={selected?.longitude}
      recordedAt={recordedAt}
      emptyMessage={emptyMessage}
    />
  );

  if (!mapsModule) {
    return placeholder;
  }

  const MapView = mapsModule.default;
  const Marker = mapsModule.Marker;
  const Polyline = mapsModule.Polyline;

  return (
    <View style={[styles.wrap, fullScreen ? styles.wrapFull : null, height != null ? { height } : null]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        mapType={mapType === 'satellite' ? 'satellite' : 'standard'}
        showsUserLocation={false}
        showsMyLocationButton={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {trailCoordinates.length > 1 ? (
          <Polyline
            coordinates={trailCoordinates}
            strokeColor={colors.primary}
            strokeWidth={3}
            lineDashPattern={[1]}
          />
        ) : null}
        {pins.map((pin) => {
          const isSelected = pin.id === (selectedId ?? selected?.id);
          return (
            <Marker
              key={pin.id}
              coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
              title={pin.title}
              pinColor={isSelected ? colors.accentGoldDeep : colors.primary}
              onPress={() => onSelectPin?.(pin.id)}
            />
          );
        })}
      </MapView>
    </View>
  );
}

export function ProtectionMapView(props: ProtectionMapViewProps) {
  const {
    pins,
    height = 240,
    fullScreen = false,
    showMapWhenEmpty = false,
    recordedAt,
    emptyMessage,
  } = props;
  const selected = pins.find((pin) => pin.id === props.selectedId) ?? pins[0] ?? null;

  const placeholder = (
    <MapPlaceholder
      latitude={selected?.latitude}
      longitude={selected?.longitude}
      recordedAt={recordedAt}
      emptyMessage={emptyMessage}
    />
  );

  if (pins.length === 0 && !fullScreen && !showMapWhenEmpty) {
    return placeholder;
  }

  return (
    <MapRenderBoundary fallback={placeholder}>
      <NativeProtectionMap
        {...props}
        height={fullScreen ? undefined : height}
        fullScreen={fullScreen}
      />
    </MapRenderBoundary>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.cardLg,
    overflow: 'hidden',
    backgroundColor: colors.slate[100],
  },
  wrapFull: {
    ...StyleSheet.absoluteFill,
    borderRadius: 0,
  },
});
