# 021 Theft Protection Signals: platform feature names for the theft-hardening checklist (TP-19, TP-20)

Author: `ux-researcher`. Date read for every source: **2026-11-17**. Scope: design note section 9.7 item 19 and section 9.2. This is a new file; no shared document was edited.

Method note: facts below come from vendor pages fetched or returned by search on the date above. "UNVERIFIED" means I could not confirm it from a vendor page. Two Apple developer-documentation pages returned empty content to my fetch tool, so the iOS API statements in rows marked (*) rest on absence of any documented API plus general knowledge, and must be re-checked by `mobile-architect` against developer.apple.com before any build.

## 1. Table

| Platform | Feature | Current official name | Min version | App can READ state? | App can OPEN the screen? | Source | Read |
|---|---|---|---|---|---|---|---|
| iOS | Lock-screen access | Settings > Face ID & Passcode (Touch ID & Passcode on home-button models) > "Allow Access When Locked": Control Center, Notification Center, Today View, Lock Screen widgets, Siri, Wallet, Home Control, Reply with Message, Return Missed Calls, USB accessories | Present in iOS 16 guide and the current guide; earliest version UNVERIFIED | No documented API (*) | No. Only the app's own Settings page is openable via `UIApplication.openSettingsURLString` (*) | https://support.apple.com/guide/iphone/control-access-information-lock-screen-iph9a2a69136/ios ; https://support.apple.com/en-us/119586 | 2026-11-17 |
| iOS | Passcode strength | Passcode Options: 4-digit numeric, 6-digit numeric (default), Custom Numeric Code, Custom Alphanumeric Code. Apple calls the custom options the most secure | n/a | No (*). iOS exposes only "a passcode is set" to apps via the Keychain access-control flag, not length (*, UNVERIFIED on Apple page) | No (*) | https://support.apple.com/en-us/119586 ; https://support.apple.com/guide/iphone/set-a-passcode-iph14a867ae/ios | 2026-11-17 |
| iOS | SIM PIN | "SIM PIN": Settings > Cellular (labelled Mobile Service in some regions) > SIM PIN. Wrong guesses can permanently lock the SIM | Not stated | No (*) | No (*) | https://support.apple.com/en-us/118228 | 2026-11-17 |
| iOS | Stolen Device Protection | **Stolen Device Protection** (confirmed). Settings > Face ID & Passcode. Choices: "Away from Familiar Locations" or "Always" under Require Security Delay | **iOS 17.3**. Needs two-factor authentication, passcode, Face ID or Touch ID, Significant Locations, Find My | No (*) | No (*) | https://support.apple.com/en-us/120340 ; https://support.apple.com/guide/iphone/use-stolen-device-protection-iph17105538b/ios | 2026-11-17 |
| iOS | Find My | **Find My** (Settings > [your name] > Find My > Find My iPhone; also "Find My network", "Send Last Location"). Activation Lock turns on automatically with Find My. Lost Mode is the companion feature | Not stated on the pages read | No (*) | No (*) | https://support.apple.com/en-us/102648 ; https://support.apple.com/en-us/108794 | 2026-11-17 |
| Android | Lock-screen quick settings | No official Google or Samsung toggle found. Samsung has "Lock network and security" under Settings > Lock screen > Secure lock settings, reported only on Samsung community threads. Google Pixel help does not say. **Treat as OEM-specific and UNVERIFIED** | n/a | No | No single intent. Generic `Settings.ACTION_SECURITY_SETTINGS` opens Security | https://support.google.com/pixelphone/answer/16520562?hl=en ; https://developer.android.com/reference/android/provider/Settings | 2026-11-17 |
| Android | Screen lock / passcode strength | "Screen lock". Whether a secure lock exists is readable. Strength or length is not exposed by the API I read | API 23 for `isDeviceSecure()` | **Yes for "a secure lock (PIN, pattern, password) is set"** via `KeyguardManager.isDeviceSecure()`. Length/strength: no public API found | Yes: `ACTION_SECURITY_SETTINGS` (guard for no matching activity); `ACTION_BIOMETRIC_ENROLL` (API 30) sets up a PIN if needed | https://developer.android.com/reference/android/app/KeyguardManager ; https://developer.android.com/reference/android/provider/Settings | 2026-11-17 |
| Android | SIM PIN | Pixel: Settings > Security & Privacy > More Security Settings > SIM Lock > Lock SIM. Menu names vary by version and OEM | Not stated | **Mostly no.** `TelephonyManager.getSimState()` returns `SIM_STATE_PIN_REQUIRED` only while the SIM is currently locked. Whether the lock is merely enabled while unlocked is not exposed publicly (the enabled-check method appears to be hidden/system-only; from general knowledge, UNVERIFIED on the page read). Permissions for `getSimState` UNVERIFIED | No dedicated intent found in the visible docs (UNVERIFIED for the unread tail). Fall back to `ACTION_SECURITY_SETTINGS` | https://support.google.com/pixelphone/answer/15146908?hl=en ; https://developer.android.com/reference/android/telephony/TelephonyManager | 2026-11-17 |
| Android | Theft Detection Lock | **Theft Detection Lock**. Settings > Google > All services > Personal & device safety > Theft protection. Uses AI, motion sensors, Wi-Fi, Bluetooth. Active only while the phone is unlocked | **Android 10+** via Google Play services. Not on Android Go, tablets, wearables. Greyed out if the model is unsupported | No public API found (UNVERIFIED that none exists) | Not via a documented intent. Web page android.com/settings/theftprotection is documented by Google as the place to turn it on | https://support.google.com/android/answer/15146908?hl=en ; https://blog.google/intl/en-africa/company-news/bringing-new-theft-protection-features-to-android-users-in-africa-and-around-the-world/ | 2026-11-17 |
| Android | Offline Device Lock | **Offline Device Lock**. Locks an unlocked phone left offline too long. Can trigger twice per 24 hours | Android 10+ via Play services | No public API found | As above | same two sources | 2026-11-17 |
| Android | Remote Lock | **Remote Lock**. Used at android.com/lock with a verified phone number. Needs a screen lock, active SIM, verified number, Find Hub on, internet. Optional security question added Jan 2026 | Android 10+ via Play services | No public API found | As above (the Remote Lock toggle sits in the Theft protection page) | https://support.google.com/android/answer/15146908?hl=en ; https://blog.google/security/android-theft-protection-feature-updates/ | 2026-11-17 |
| Android | Other named features | **Failed Authentication Lock** (on by default, own toggle since Jan 2026); **Identity Check** (biometric for sensitive changes outside trusted places; Android 15+ on supported Pixel and Samsung One UI 7 devices; shown only if the device supports it) | Identity Check: Android 15+ | No public API found | As above | https://support.google.com/android/answer/15146908?hl=en ; https://blog.google/security/android-theft-protection-identity-check-expanded-features/ | 2026-11-17 |
| Android | Find Hub | **Find Hub**, formerly **Find My Device**. Google help now uses "Find Hub" throughout. Path cited by a search summary of Google help: Settings > Security > Find Hub, "Allow device to be located". Turned on automatically when a Google Account is added | Find My Device was Android 5+ (2024 post). Find Hub min version UNVERIFIED | No public API found | Not via a documented intent. Open the Find Hub app or web page | https://support.google.com/android/answer/15146908?hl=en ; https://blog.google/products/android/locate-lost-belongings-find-hub/ | 2026-11-17 |

## 2. Names that differ from the candidate list

- iOS: **Stolen Device Protection** and **Find My** are both exactly right.
- Android: there is **no single "theft-lock" feature**. The umbrella page is titled "Protect your personal data against theft" and the settings page is **Theft protection**. The locks are three named features: Theft Detection Lock, Offline Device Lock, Remote Lock. Add Failed Authentication Lock and Identity Check.
- **Find Hub** is correct and replaces Find My Device. Google's May 2025 post does not give a rename date (UNVERIFIED).
- Android menu names differ between Pixel and Samsung. The checklist must not hard-code one path as universal.

## 3. What changed in the last 12 months (since Nov 2025)

- 2026-01-27 (Google): Failed Authentication Lock got its own toggle; Identity Check extended to everything using Android Biometric Prompt; longer lockouts after wrong guesses; Remote Lock optional security question; Theft Detection Lock and Remote Lock default ON for new devices activated in Brazil. Source: https://blog.google/security/android-theft-protection-feature-updates/ (read 2026-11-17).
- Android 17 default-on: a search summary of Google pages says Remote Lock and Theft Detection Lock are on by default for new, freshly reset or upgraded Android 17 devices, and extended to Android 10+ devices in Argentina, Chile, Colombia, Mexico, Peru and the UK. I did NOT open the underlying page. **UNVERIFIED**; treat as "may be on by default on some devices", never as fact. Candidate source to open: https://blog.google/security/whats-new-in-android-security-privacy-2026/
- Apple: the Stolen Device Protection support page says it "might be turned on by default" and was recently updated. I found no Apple page saying a specific iOS release changed the default. **UNVERIFIED** which iOS version, if any, changed it. The Apple guide index fetched also showed an "iOS 27" guide; I did not read what it says about this feature.
- Net effect: on both platforms, "on by default" now varies by device, region and OS version, which is another reason the app cannot assume state.

## 4. What the theft-hardening checklist may honestly claim

The score is a self-attested checklist. The app may say:

1. "You told us you have turned this on." Every item is the customer's own tick, labelled as such.
2. On Android only, and only for the screen lock: "This phone has a PIN, pattern or password set" (`isDeviceSecure()`). It says nothing about strength.
3. "Here is where this setting usually lives on your phone" with a plain-language path, plus "menus differ by phone maker".
4. "Some of these features need a recent phone or software, or are not available on every model." Greyed-out means unsupported; the app cannot tell the user which.
5. "TD cannot check these settings on your phone." Stated on the score screen, not in a footnote.
6. Neutral facts from vendor pages, cited in help copy: iOS Stolen Device Protection needs iOS 17.3 or later; Android theft locks need Android 10 or later with Google Play services and are not available on Go devices, tablets or wearables.
7. Checklist progress as a count ("4 of 7 ticked"). Avoid a percentage or traffic-light that implies verified security.

## 5. Wording to avoid

- "Your phone is protected", "secured", "theft-proof", "verified", "safe".
- "Protected" or "Hardened" as a badge or colour state (green tick) unless it is visibly labelled "your answer".
- Any text implying TD detected or confirmed a setting on iOS, or on Android for anything except "a screen lock is set".
- "Score" language that reads as an audit or insurance rating; do not link it to premium, claims eligibility or payout.
- Stating a setting "is on by default" for any device.
- Using the old name "Find My Device" in new copy; use "Find Hub".
- Naming Apple "Find My" and Google "Find Hub" as if TD runs them. TD tracking and vendor tracking are separate; say "Apple's Find My" and "Google's Find Hub".
- Promising a recovery outcome ("we will get it back"), and any copy that blames the user if a feature was off at the time of theft (claims-fairness and compliance risk; route wording to `compliance-specialist`).
- Telling users to enter or choose a SIM PIN without the warning that wrong guesses can permanently lock the SIM and that the carrier default PIN is often publicly known.

## 6. Open items for other roles

- `mobile-architect`: confirm on developer.apple.com that no API reads these iOS settings, and confirm `getSimState` permission needs and Android 17 behaviour before any build. Do not use undocumented `prefs:` URL schemes (App Review risk).
- `technical-writer`: per-OEM path copy (Pixel, Samsung at minimum), kept out of code so it can change without a release.
- Re-verify this file before stage (b) ships; platform names and defaults moved at least twice in 2026.
