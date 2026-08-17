export { getLocationTrackingConsent, setLocationTrackingConsent, clearLocationTrackingConsent, getLinkedSmartphoneAssetId, setLinkedSmartphoneAssetId, clearLinkedSmartphoneAssetId, hasActiveLocationTracking } from './consent';
export type { LocationTrackingConsent } from './consent';
export { LocationConsentModal } from './LocationConsentModal';
export type { LocationConsentModalProps } from './LocationConsentModal';
export { formatRelativeTime } from './formatRelativeTime';
export {
  requestForegroundLocation,
  requestForegroundLocationPermission,
  getForegroundLocationFix,
  LocationPermissionDeniedError,
  LocationServicesDisabledError,
} from './requestForegroundLocation';
export type { ForegroundLocationFix } from './requestForegroundLocation';
export { useLocationReporter, maybeReportForegroundLocation } from './useLocationReporter';
