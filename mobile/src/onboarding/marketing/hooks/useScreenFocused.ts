import * as Router from 'expo-router';
import { useCallback, useState } from 'react';

type FocusEffect = (effect: () => void | (() => void)) => void;

// Tests mock expo-router without this hook, so fall back to a no-op. Chosen once at load, so the call below is
// unconditional on every render.
const useFocus: FocusEffect =
  (Router as unknown as { useFocusEffect?: FocusEffect }).useFocusEffect ??
  (() => undefined);

/** True while this screen is the focused one, so timers can pause when another screen is pushed on top. */
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useFocus(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}
