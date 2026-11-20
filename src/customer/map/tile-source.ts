/**
 * Single source of truth for the web map tile provider.
 *
 * OpenStreetMap standard tiles, subdomain-less URL (the form OSM now
 * recommends). Mobile's LeafletMapView uses the same provider. The
 * tile-provider ADR is still pending — if the provider changes, change it
 * here and in vercel.json's CSP img-src together;
 * src/security/http-security-headers.test.ts fails if the two drift.
 */
export const OSM_TILE_ORIGIN = 'https://tile.openstreetmap.org';
export const OSM_TILE_URL = `${OSM_TILE_ORIGIN}/{z}/{x}/{y}.png`;
/** OSM licence (ODbL) requires this attribution to be visible on the map. */
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

/**
 * Leaflet TileLayer options. The site-wide `Referrer-Policy: no-referrer`
 * header stays as-is; only tile <img> requests override it to `strict-origin`
 * so OSM (whose tile usage policy may refuse Referer-less requests) receives
 * the site origin and never the page path.
 */
export const OSM_TILE_LAYER_OPTIONS = {
  maxZoom: 19,
  attribution: OSM_ATTRIBUTION,
  referrerPolicy: 'strict-origin',
} as const;
