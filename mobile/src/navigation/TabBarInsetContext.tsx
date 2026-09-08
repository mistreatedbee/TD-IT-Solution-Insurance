import React, { createContext, useContext, useMemo } from 'react';
import { spacing } from '../theme/tokens';
import { useFloatingTabBarOffset } from './tabBarMetrics';

const TabBarInsetContext = createContext(0);

/** Wraps the tab navigator so scrollable screens can pad content above the glass tab bar. */
export function TabBarInsetProvider({ children }: { children: React.ReactNode }) {
  const tabBarOffset = useFloatingTabBarOffset();
  const contentInset = useMemo(() => tabBarOffset + spacing.sm, [tabBarOffset]);

  return (
    <TabBarInsetContext.Provider value={contentInset}>{children}</TabBarInsetContext.Provider>
  );
}

/** Extra bottom padding for tab-root scroll content (0 outside the tab shell). */
export function useTabBarContentInset(): number {
  return useContext(TabBarInsetContext);
}
