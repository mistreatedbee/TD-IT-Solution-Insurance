import React from 'react';
import { FEATURE_ASSISTANT_ENTRY_ENABLED } from '../../src/config/features';
import { AssistantScreen } from '../../src/screens/assistant/AssistantScreen';
import { FeatureUnavailableScreen } from '../../src/screens/common/FeatureUnavailableScreen';

/** Feature 024 Phase 1a: owner-test only until Stage 8 + Stage 10 clear the screen. */
export default function AssistantRoute() {
  if (!FEATURE_ASSISTANT_ENTRY_ENABLED) {
    return (
      <FeatureUnavailableScreen
        headline="The assistant is coming soon."
        body="The in-app assistant is not available in this build yet. If you need help, contact our support team from the Account tab."
      />
    );
  }
  return <AssistantScreen />;
}
