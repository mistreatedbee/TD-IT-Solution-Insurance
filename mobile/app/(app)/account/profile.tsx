import { FEATURE_KYC_ENABLED } from '../../../src/config/features';
import { ProfileEditScreen } from '../../../src/screens/account/ProfileEditScreen';
import { FeatureUnavailableScreen } from '../../../src/screens/common/FeatureUnavailableScreen';

/**
 * INC-001 A-12 / F009-1: profile edit collects PII with no Stage 8 record.
 */
export default function AccountProfileRoute() {
  if (!FEATURE_KYC_ENABLED) {
    return (
      <FeatureUnavailableScreen
        headline="Profile editing is coming soon."
        body="Identity and profile updates are not available in this build yet. Your account email and protection plan are still visible from the Account tab."
      />
    );
  }

  return <ProfileEditScreen />;
}
