/**
 * LeafletMapView: real OpenStreetMap tiles without a Google Maps key.
 *
 * Android's react-native-maps needs a Google Maps API key; without one the native view crashes the app
 * (see src/lib/nativeMaps.ts). This component renders a Leaflet map in a WebView instead, so Android
 * builds without a key still get real map tiles.
 *
 * - Leaflet 1.9.4 is loaded from unpkg, pinned by version AND by Subresource Integrity hash. It is the
 *   only remote script. Tiles come from the OSM standard tile server, with the required
 *   "© OpenStreetMap contributors" attribution always visible.
 *   NOTE: the public OSM tile server is acceptable for low-volume testing only. A tile-provider
 *   decision (integration-architect) is needed before public launch.
 * - Props reach the page through injectJavaScript (one JSON payload); the page answers through
 *   postMessage (ready / tiles / pin / mapPress / error). Coordinates are never logged.
 * - The WebView only loads the inline page: originWhitelist is about:blank, every other navigation is
 *   refused, and file access is off. A Content-Security-Policy limits the page to Leaflet + OSM tiles.
 * - If Leaflet or the tiles cannot load (offline, blocked, timeout), `fallback` (the drawn map) is shown.
 *   The fallback is also shown underneath while the page loads, so there is never a blank box.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useDesignTokens } from '../theme/designTheme';

export type LeafletPinTone = 'default' | 'selected' | 'danger' | 'success';

export interface LeafletPin {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  tone?: LeafletPinTone;
}

export interface LeafletCoordinate {
  latitude: number;
  longitude: number;
}

export interface LeafletEdgePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LeafletMapViewProps {
  pins?: LeafletPin[];
  /** The selected pin is drawn in the "selected" tone and centred on. */
  selectedId?: string | null;
  onSelectPin?: (id: string) => void;
  /** Fires when the map itself (not a pin) is tapped. */
  onMapPress?: () => void;
  /** Optional trail drawn as a line (e.g. tracking history). */
  trail?: LeafletCoordinate[];
  /** Fit the view to all pins when nothing is selected (default true). */
  fitToPins?: boolean;
  edgePadding?: LeafletEdgePadding;
  /** View used when there are no pins (or fitToPins is off). */
  center?: LeafletCoordinate;
  zoom?: number;
  /** Zoom used when centring on a single or selected pin. */
  focusZoom?: number;
  /** false = static background (no pan/zoom/tap). Default true. */
  interactive?: boolean;
  /** Shown while loading and if the map cannot load (e.g. the drawn map). */
  fallback?: React.ReactNode;
  /** Called once when the map gives up and shows the fallback. */
  onUnavailable?: () => void;
  /** How long to wait for the first tile before falling back (ms). */
  loadTimeoutMs?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const DEFAULT_CENTER: LeafletCoordinate = { latitude: -26.2041, longitude: 28.0473 };
const DEFAULT_ZOOM = 12;
const DEFAULT_FOCUS_ZOOM = 15;
const DEFAULT_PADDING: LeafletEdgePadding = { top: 48, right: 48, bottom: 48, left: 48 };
const DEFAULT_TIMEOUT_MS = 15000;
// Stable defaults so a parent re-render does not re-send the page an identical payload.
const NO_PINS: LeafletPin[] = [];
const NO_TRAIL: LeafletCoordinate[] = [];

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors';

/** Static page. Everything that changes arrives later through window.__tdMapUpdate(payload). */
export const LEAFLET_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src https://tile.openstreetmap.org https://unpkg.com data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'" />
<link rel="stylesheet" href="${LEAFLET_CSS}" integrity="${LEAFLET_CSS_SRI}" crossorigin="" />
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: transparent; }
  .td-night .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9) saturate(0.6); }
  .td-pin { border-radius: 50%; border: 3px solid #fff; box-sizing: border-box; box-shadow: 0 1px 4px rgba(0,0,0,0.35); }
  .leaflet-control-attribution { font: 10px/1.4 -apple-system, Roboto, sans-serif; }
</style>
</head>
<body>
<div id="map"></div>
<script>
(function () {
  var RN = window.ReactNativeWebView;
  function send(msg) { try { RN && RN.postMessage(JSON.stringify(msg)); } catch (e) {} }
  window.__tdMapFail = function () { send({ type: 'error' }); };
  window.__tdBoot = function () {
    if (typeof L === 'undefined') { send({ type: 'error' }); return; }
    var map = null, tiles = null, pinLayer = null, trailLayer = null, tileLoaded = false, tileErrors = 0;
    var lastView = '';
    function build(p) {
      map = L.map('map', {
        zoomControl: false,
        attributionControl: true,
        dragging: p.interactive, touchZoom: p.interactive, doubleClickZoom: p.interactive,
        scrollWheelZoom: false, boxZoom: false, keyboard: false, tap: p.interactive,
        inertia: p.interactive
      });
      map.attributionControl.setPrefix(false);
      tiles = L.tileLayer(${JSON.stringify(OSM_TILE_URL)}, {
        maxZoom: 19,
        attribution: ${JSON.stringify(OSM_ATTRIBUTION)}
      });
      tiles.on('tileload', function () {
        if (!tileLoaded) { tileLoaded = true; send({ type: 'tiles' }); }
      });
      tiles.on('tileerror', function () {
        tileErrors += 1;
        if (!tileLoaded && tileErrors >= 4) send({ type: 'error' });
      });
      tiles.addTo(map);
      pinLayer = L.layerGroup().addTo(map);
      map.on('click', function () { send({ type: 'mapPress' }); });
    }
    function pinIcon(colour, selected) {
      var size = selected ? 26 : 20;
      var el = document.createElement('div');
      el.className = 'td-pin';
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.background = colour;
      return L.divIcon({ html: el.outerHTML, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    }
    window.__tdMapUpdate = function (p) {
      if (!map) build(p);
      document.body.className = p.night ? 'td-night' : '';
      document.body.style.background = p.background;
      pinLayer.clearLayers();
      var latlngs = [];
      var selectedLatLng = null;
      p.pins.forEach(function (pin) {
        var ll = [pin.latitude, pin.longitude];
        latlngs.push(ll);
        var isSel = pin.id === p.selectedId;
        if (isSel) selectedLatLng = ll;
        var m = L.marker(ll, {
          icon: pinIcon(p.colours[pin.tone] || p.colours['default'], isSel),
          title: String(pin.label),
          keyboard: false,
          interactive: p.interactive,
          zIndexOffset: isSel ? 1000 : 0
        });
        if (p.interactive) {
          m.on('click', function (ev) {
            if (ev && ev.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent);
            send({ type: 'pin', id: pin.id });
          });
        }
        if (isSel && pin.label) {
          m.bindTooltip(String(pin.label), { permanent: true, direction: 'top', offset: [0, -14] });
        }
        m.addTo(pinLayer);
      });
      if (trailLayer) { map.removeLayer(trailLayer); trailLayer = null; }
      if (p.trail && p.trail.length > 1) {
        trailLayer = L.polyline(p.trail.map(function (c) { return [c.latitude, c.longitude]; }), {
          color: p.colours.trail, weight: 3, dashArray: '2 6', interactive: false
        }).addTo(map);
      }
      // Only move the camera when what we are looking at changes, so a re-render does not undo a user's pan.
      var viewKey = JSON.stringify([p.selectedId, latlngs, p.center, p.zoom, p.fitToPins]);
      if (viewKey === lastView) return;
      lastView = viewKey;
      var animate = !!map._loaded && p.interactive;
      if (selectedLatLng) {
        map.setView(selectedLatLng, p.focusZoom, { animate: animate });
      } else if (p.fitToPins && latlngs.length === 1) {
        map.setView(latlngs[0], p.focusZoom, { animate: animate });
      } else if (p.fitToPins && latlngs.length > 1) {
        map.fitBounds(L.latLngBounds(latlngs), {
          paddingTopLeft: [p.padding.left, p.padding.top],
          paddingBottomRight: [p.padding.right, p.padding.bottom],
          maxZoom: p.focusZoom,
          animate: animate
        });
      } else {
        map.setView([p.center.latitude, p.center.longitude], p.zoom, { animate: false });
      }
    };
    send({ type: 'ready' });
  };
})();
</script>
<script src="${LEAFLET_JS}" integrity="${LEAFLET_JS_SRI}" crossorigin="" onload="window.__tdBoot()" onerror="window.__tdMapFail()"></script>
</body>
</html>`;

type PageMessage =
  | { type: 'ready' }
  | { type: 'tiles' }
  | { type: 'error' }
  | { type: 'mapPress' }
  | { type: 'pin'; id: string };

function parseMessage(raw: string): PageMessage | null {
  try {
    const msg = JSON.parse(raw) as { type?: unknown; id?: unknown };
    switch (msg.type) {
      case 'ready':
      case 'tiles':
      case 'error':
      case 'mapPress':
        return { type: msg.type };
      case 'pin':
        return typeof msg.id === 'string' ? { type: 'pin', id: msg.id } : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** JSON is a JS literal except for U+2028/U+2029 in older engines; escape those too. */
function toJsLiteral(value: unknown): string {
  return JSON.stringify(value)
    .split(String.fromCharCode(0x2028))
    .join('\\u2028')
    .split(String.fromCharCode(0x2029))
    .join('\\u2029');
}

function isFiniteCoord(c: LeafletCoordinate): boolean {
  return Number.isFinite(c.latitude) && Number.isFinite(c.longitude);
}

export function LeafletMapView({
  pins = NO_PINS,
  selectedId = null,
  onSelectPin,
  onMapPress,
  trail = NO_TRAIL,
  fitToPins = true,
  edgePadding = DEFAULT_PADDING,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  focusZoom = DEFAULT_FOCUS_ZOOM,
  interactive = true,
  fallback = null,
  onUnavailable,
  loadTimeoutMs = DEFAULT_TIMEOUT_MS,
  style,
  testID = 'leaflet-map',
}: LeafletMapViewProps) {
  const t = useDesignTokens();
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState(false);
  const [failed, setFailed] = useState(false);

  const payload = useMemo(
    () => ({
      pins: pins
        .filter(isFiniteCoord)
        .map((p) => ({
          id: p.id,
          latitude: p.latitude,
          longitude: p.longitude,
          label: p.label,
          tone: p.tone ?? 'default',
        })),
      selectedId,
      trail: trail.filter(isFiniteCoord),
      fitToPins,
      padding: edgePadding,
      center,
      zoom,
      focusZoom,
      interactive,
      night: t.mode === 'night',
      background: t.colors.bgSunken,
      colours: {
        default: t.colors.brandBlue,
        selected: t.colors.brandOrange,
        danger: t.colors.danger,
        success: t.colors.success,
        trail: t.colors.brandBlue,
      },
    }),
    [pins, selectedId, trail, fitToPins, edgePadding, center, zoom, focusZoom, interactive, t],
  );

  const fail = useCallback(() => {
    setFailed((already) => {
      if (!already) onUnavailable?.();
      return true;
    });
  }, [onUnavailable]);

  // Push the current props into the page whenever they change (once the page is ready).
  useEffect(() => {
    if (!ready || failed) return;
    webRef.current?.injectJavaScript(
      `window.__tdMapUpdate && window.__tdMapUpdate(${toJsLiteral(payload)}); true;`,
    );
  }, [ready, failed, payload]);

  // Give up (show the drawn map) if no tile arrives in time — offline or blocked.
  useEffect(() => {
    if (shown || failed) return;
    const timer = setTimeout(fail, loadTimeoutMs);
    return () => clearTimeout(timer);
  }, [shown, failed, fail, loadTimeoutMs]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const msg = parseMessage(event.nativeEvent.data);
      if (!msg) return;
      switch (msg.type) {
        case 'ready':
          setReady(true);
          break;
        case 'tiles':
          setShown(true);
          break;
        case 'error':
          fail();
          break;
        case 'mapPress':
          if (interactive) onMapPress?.();
          break;
        case 'pin':
          if (interactive && pins.some((p) => p.id === msg.id)) onSelectPin?.(msg.id);
          break;
      }
    },
    [fail, interactive, onMapPress, onSelectPin, pins],
  );

  const source = useMemo(() => ({ html: LEAFLET_HTML }), []);

  if (failed) {
    return <View style={[styles.wrap, style]} testID={`${testID}-fallback`}>{fallback}</View>;
  }

  return (
    <View
      style={[styles.wrap, { backgroundColor: t.colors.bgSunken }, style]}
      pointerEvents={interactive ? 'auto' : 'none'}
      testID={testID}
    >
      {!shown ? <View style={StyleSheet.absoluteFill}>{fallback}</View> : null}
      <WebView
        ref={webRef}
        testID={`${testID}-webview`}
        source={source}
        style={[styles.web, { opacity: shown ? 1 : 0 }]}
        originWhitelist={['about:blank']}
        onShouldStartLoadWithRequest={(req) => req.url.startsWith('about:')}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        allowsLinkPreview={false}
        geolocationEnabled={false}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        mixedContentMode="never"
        applicationNameForUserAgent="TDITInsuranceMobile"
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={onMessage}
        onError={fail}
        onHttpError={fail}
        onRenderProcessGone={fail}
        onContentProcessDidTerminate={fail}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  web: { flex: 1, backgroundColor: 'transparent' },
});
