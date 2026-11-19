import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getForegroundPermissionState, type ForegroundPermissionState } from './requestForegroundLocation';

/** Current OS location permission/services state; re-read when the app returns to the foreground (e.g. from Settings). */
export function useForegroundPermissionState(): {
  state: ForegroundPermissionState | null;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<ForegroundPermissionState | null>(null);
  const refresh = useCallback(async () => {
    try {
      setState(await getForegroundPermissionState());
    } catch {
      setState(null);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    getForegroundPermissionState().then(
      (next) => {
        if (!cancelled) setState(next);
      },
      () => {
        if (!cancelled) setState(null);
      },
    );
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [refresh]);
  return { state, refresh };
}
