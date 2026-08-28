import { FEATURE_HARDWARE_TRACKING_ENABLED } from '../../../../src/config/features';
import { InstallationGuideScreen } from '../../../../src/screens/assets/InstallationGuideScreen';
import { FeatureUnavailableScreen } from '../../../../src/screens/common/FeatureUnavailableScreen';

export default function InstallationGuideRoute() {
  if (!FEATURE_HARDWARE_TRACKING_ENABLED) {
    return (
      <FeatureUnavailableScreen
        headline="Installation guide is coming soon."
        body="Hardware installation instructions are not available in this build yet."
      />
    );
  }

  return <InstallationGuideScreen />;
}
