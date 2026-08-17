import type { ProtectionDashboardData } from './types';

export function deriveDashboardSubtitle(data: Pick<
  ProtectionDashboardData,
  | 'isPendingVerification'
  | 'assetCount'
  | 'profilePercent'
  | 'trackingActiveCount'
  | 'trackingOnlineCount'
  | 'criticalAlertCount'
  | 'alertCount'
>): string {
  if (data.criticalAlertCount > 0) {
    return 'Immediate attention required.';
  }
  if (data.isPendingVerification) {
    return 'Verify your email to unlock full protection.';
  }
  if (data.assetCount === 0) {
    return "Let's finish setting up your protection.";
  }
  if (data.profilePercent < 100) {
    return 'A few details will strengthen your protection.';
  }
  if (data.trackingActiveCount === 0 && data.assetCount > 0) {
    return 'Connect tracking to see your assets on the map.';
  }
  if (data.trackingOnlineCount < data.trackingActiveCount) {
    return 'One of your devices needs attention.';
  }
  if (data.alertCount > 0) {
    return 'Review your alerts when you have a moment.';
  }
  return 'Your protection is looking good.';
}
