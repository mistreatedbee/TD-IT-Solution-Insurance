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
  LocationTimeoutError,
  getForegroundPermissionState,
  isCoarseAccuracy,
} from './requestForegroundLocation';
export type { ForegroundLocationFix, ForegroundPermissionState } from './requestForegroundLocation';
export {
  useLocationReporter,
  maybeReportForegroundLocation,
  canReportLocation,
  markLocationSent,
  getLastLocationSentAt,
  wasLocationSentRecently,
  PERIODIC_REPORT_INTERVAL_MS,
} from './useLocationReporter';
export type { ReportGateResult, ReportOutcome } from './useLocationReporter';
export { clearLocalLocationState, subscribeLocationConsentChange } from './consent';
export { useForegroundPermissionState } from './useForegroundPermissionState';
