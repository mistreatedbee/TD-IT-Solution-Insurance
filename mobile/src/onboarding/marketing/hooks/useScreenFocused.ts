import * as Router from 'expo-router';
import { useCallback, useState } from 'react';

type FocusEffect = (effect: () => void | (() => void)) => void;

/** True while this screen is the focused one, so timers can pause when another screen is pushed on top. */
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);
  // Tests mock expo-router without this hook; the optional call keeps them working.
  const useFocus = (Router as unknown as { useFocusEffect?: FocusEffect })
    .useFocusEffect;
  useFocus?.(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}
