import { FEATURE_KYC_ENABLED } from '../../../src/config/features';
import { VerificationCentreScreen } from '../../../src/screens/account/VerificationCentreScreen';
import { FeatureUnavailableScreen } from '../../../src/screens/common/FeatureUnavailableScreen';

/**
 * INC-001 A-12 / F009-1: verification centre submits SA ID and address with
 * no Stage 8 record.
 */
export default function AccountVerificationRoute() {
  if (!FEATURE_KYC_ENABLED) {
    return (
      <FeatureUnavailableScreen
        headline="Identity verification is coming soon."
        body="ID verification is not available in this build yet. You can still manage your protection plan and registered assets."
      />
    );
  }

  return <VerificationCentreScreen />;
}
