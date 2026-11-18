/**
 * Generate the WHITE-background app icon set and native splash from the design pack's own light-background
 * mark (design-system/reference/assets/logo/logo-mark.svg: orange + brand blue). The same polygons are drawn by
 * src/components/LoadingScreen.tsx, so icon, native splash and loading screen share one shape.
 *
 * Run: node scripts/generate-app-icon-white.mjs   (from mobile/)
 *
 * Writes the files app.json already points at:
 *   assets/app-icon-ios-1024.png                 white square, mark centred (iOS rounds the corners itself; no alpha)
 *   assets/app-icon-android-foreground-1024.png  mark on transparent, inside the 66% adaptive safe zone
 *   assets/app-icon-android-background-1024.png  solid white
 *   assets/app-icon-android-monochrome-1024.png  white silhouette on transparent (Android 13+ themed icons)
 *   assets/splash-1284x2778.png                  white, mark placed where LoadingScreen draws it (no jump at hand-over)
 * assets/splash-night-1284x2778.png is the design pack's original navy splash, kept (not generated) as the dark-mode
 * splash (app.json `expo-splash-screen` > `dark`), so dark-mode phones go navy splash -> navy loading screen -> Night UI.
 * The notification icon is a separate monochrome asset and is not touched. Never add text, a border or a shadow.
 */
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'assets');

const ORANGE = '#F5A022';
const BLUE = '#2780B8';
// Mark geometry from logo-mark.svg (viewBox 422.5 145.25 522 587.75).
const MARK_W = 522;
const MARK_H = 587.75;
const markSvg = (top, bottom) => `
  <g transform="translate(-422.5 -145.25)">
    <g transform="translate(0 127)">
      <polygon fill="${top}" points="683.50,26.25 936.50,279.25 901.00,279.25 683.50,61.75 466.00,279.25 430.50,279.25"/>
      <polygon fill="${bottom}" points="683.50,138.00 826.50,281.00 806.50,281.00 683.50,158.00 560.50,281.00 540.50,281.00"/>
    </g>
    <g transform="translate(0 -127)">
      <polygon fill="${bottom}" points="683.50,852.00 936.50,599.00 901.00,599.00 683.50,816.50 466.00,599.00 430.50,599.00"/>
      <polygon fill="${bottom}" points="683.50,740.25 826.50,597.25 806.50,597.25 683.50,720.25 560.50,597.25 540.50,597.25"/>
    </g>
  </g>`;

function canvas(w, h, bg, scale, cx, cy, mono = false) {
  const x = cx - (MARK_W * scale) / 2;
  const y = cy - (MARK_H * scale) / 2;
  const [t, b] = mono ? ['#FFFFFF', '#FFFFFF'] : [ORANGE, BLUE];
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      (bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : '') +
      `<g transform="translate(${x} ${y}) scale(${scale})">${markSvg(t, b)}</g></svg>`,
  );
}
const png = (svg) => sharp(svg).png();

// iOS: the mark can be large (same proportion as the design pack's navy icon: 1.0453 of its native size).
await png(canvas(1024, 1024, '#FFFFFF', 1.0453, 512, 512)).removeAlpha().toFile(path.join(assets, 'app-icon-ios-1024.png'));
// Android adaptive: the mark's diagonal (about 786 * scale) must stay inside the 66% safe circle (676 px).
const ANDROID_SCALE = 0.8;
await png(canvas(1024, 1024, null, ANDROID_SCALE, 512, 512)).toFile(path.join(assets, 'app-icon-android-foreground-1024.png'));
await png(canvas(1024, 1024, null, ANDROID_SCALE, 512, 512, true)).toFile(path.join(assets, 'app-icon-android-monochrome-1024.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#FFFFFF' } }).png().toFile(path.join(assets, 'app-icon-android-background-1024.png'));

// Splash: LoadingScreen centres [mark 120dp wide + 40dp gap + 3dp bar] in the screen; at 3x that is a 360 px
// wide mark whose block is centred vertically, so the mark centre sits 21.5 dp * 3 above the screen centre.
const SPLASH_SCALE = 360 / MARK_W;
await png(canvas(1284, 2778, '#FFFFFF', SPLASH_SCALE, 642, 1389 - ((40 + 3) / 2) * 3)).removeAlpha().toFile(path.join(assets, 'splash-1284x2778.png'));
console.log('Wrote white app icon set and splash to mobile/assets');
