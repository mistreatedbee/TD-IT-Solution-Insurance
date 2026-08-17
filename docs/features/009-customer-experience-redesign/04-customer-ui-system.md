# 04 — Customer UI Design System

**Agent 3 — Customer UI Designer** (`ui-designer`, `design-system-manager`)

---

## 1. Brand application

**TD IT Solution Insurance** — InsurTech protection platform, not generic insurance or GPS app.

| Role | Token | Value | Usage |
|------|-------|-------|-------|
| Primary | Navy | `#2C3E50` | Headers, primary text, tab bar |
| Secondary | Blue | `#2780B8` | Links, secondary actions, map accents |
| Accent | Gold | `#F5A022` | Protection highlights, premium CTAs |
| Accent deep | Orange-gold | `#D9720A` | Map pins, critical warmth |
| Surface | Warm card | `#F5F1EA` | Cards on white |
| Success | Emerald | `#059669` | Online, verified |
| Warning | Amber | `#D97706` | Stale location, low battery |
| Danger | Red | `#DC2626` | Critical alerts, stolen |

**Typography:** Fraunces (headings) · Public Sans (body) — already on web; mobile mirrors sizes in `typography` tokens.

**Motion:** Subtle pulse on protection health ring (300ms ease); map marker fade-in; no gratuitous parallax.

---

## 2. New components (require `design-system-manager` sign-off)

Extend existing primitives — **do not fork**.

| Component | Purpose | Web base | Mobile base |
|-----------|---------|----------|-------------|
| `ProtectionHealthCard` | System-health dashboard strip | New; compose StatBlock + Badge | Compose Card + Badge |
| `AssetVaultCard` | Premium asset row | AssetBadge + Card | Card + Badge |
| `TrackingStatusChip` | ONLINE / LAST KNOWN / UNAVAILABLE | StatusBadge variant | Badge + icon |
| `ProfileCompletionRing` | % complete + checklist | Circular progress + list | SVG ring or progress bar |
| `AlertSeverityRow` | Alert centre item | InlineAlert pattern | Alert primitive |
| `QuickActionBar` | Home actions | Button row | Button row |
| `ProtectionMap` | Map wrapper with honest labels | Map library TBD | react-native-maps |
| `DeviceCapabilityGrid` | Battery/GPS/network cells | DetailGrid | Card grid |
| `ActivityTimeline` | Asset/case events | Vertical StepItem | Custom list |
| `EmergencyActionButton` | Report lost/stolen | Button danger variant | Floating or prominent |

**Existing to reuse:** Button, Card, Badge, StatBlock, GlassCard, AssetBadge, SectionHeading, Alert, StepItem.

---

## 3. Visual tone by surface

| Surface | Density | Mood |
|---------|---------|------|
| Customer mobile | Airy, card-based | Calm, trustworthy, intelligent |
| Customer web | Medium | Same as mobile, wider layout |
| Security ops | High, map-centric | Technical, operational, urgent-capable |
| Admin | Corporate tables | Analytical, management |

---

## 4. Tracking status visual language

Each state uses **icon + label + optional color**:

| State | Icon | Label | When |
|-------|------|-------|------|
| Online | ● | Online | Fresh self-device or hardware ping within threshold |
| Last known | ◐ | Last known | Stale but valid coordinates |
| Offline | ○ | Offline | No ping beyond offline threshold |
| Low battery | 🔋 | Low battery | Telemetry supports it |
| Critical battery | ⚠ | Critical battery | Telemetry supports it |
| No GPS | ⊘ | No GPS fix | Device reports no fix |
| No network | 📡 | No network | Device reports no connectivity |
| Moving | → | Moving | Speed > threshold (hardware) |
| Stationary | ■ | Stationary | Hardware supports |
| Tracking disabled | 🚫 | Tracking off | User revoked consent |
| Unavailable | — | Tracking unavailable | Asset type can't self-report; no hardware |

**Never show** battery/speed/moving for smartphone self-device Phase 1.

---

## 5. Map design rules

1. Label: **"Live protection map"** with sublabel **"Last known locations"** when no live stream
2. Stale pins: reduced opacity + timestamp callout
3. Filter chips: All · Trackable · Needs attention
4. Expand control → full-screen map tab
5. Tap marker → bottom sheet: asset name, status, last update, [View asset]

---

## 6. Anti-patterns (do not build)

- Generic blue insurance hero with stock family photo
- Racing-car GPS aesthetic
- Fake pulsing dots without fresh data
- Same photo checklist for TV and vehicle
- "Live tracking" without defining freshness threshold (default: **2 min** = online for hardware; self-device = on app open only)

---

## 7. Dark mode

**FUTURE** — web has dark tokens; mobile explicitly light-only today. Do not block Phase 1 on dark mode.
