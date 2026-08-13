import {
  createContext,
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ForegroundLocationContext,
  type ForegroundLocationSession,
} from "@/features/location/hooks/foregroundLocationContext";
import type {
  LocationProvider,
  LocationReading,
  LocationWatchHandle,
} from "@/features/location/types/location";
import {
  deriveLocationState,
  locationStateLabel,
} from "@/features/location/utils/locationState";

/**
 * Session-scoped foreground GPS. Does not request permission until `enable()`,
 * stops `watchPosition` when disabled, unmounted, or the document is hidden
 * (battery-conscious tab / home-screen background). Not background tracking.
 */
export function ForegroundLocationProvider({
  children,
  location,
}: {
  children: ReactNode;
  location: LocationProvider;
}) {
  const [optedIn, setOptedIn] = useState(false);
  const [reading, setReading] = useState<LocationReading | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!optedIn) {
      setReading(null);
      return;
    }

    let handle: LocationWatchHandle | null = null;

    const startWatch = () => {
      if (handle) return;
      handle = location.watch(setReading);
    };

    const stopWatch = () => {
      handle?.stop();
      handle = null;
    };

    const syncVisibility = () => {
      if (typeof document !== "undefined" && document.hidden) {
        stopWatch();
        return;
      }
      startWatch();
    };

    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      stopWatch();
    };
  }, [location, optedIn, retryToken]);

  const enable = useCallback(() => setOptedIn(true), []);
  const retry = useCallback(() => {
    setReading(null);
    setOptedIn(true);
    setRetryToken((token) => token + 1);
  }, []);
  const disable = useCallback(() => {
    setOptedIn(false);
    setReading(null);
  }, []);

  const state = useMemo(
    () => deriveLocationState(reading, { watching: optedIn }),
    [reading, optedIn],
  );

  const value = useMemo<ForegroundLocationSession>(
    () => ({
      optedIn,
      reading,
      state,
      stateLabel: locationStateLabel(state),
      enable,
      retry,
      disable,
    }),
    [optedIn, reading, state, enable, retry, disable],
  );

  return createElement(ForegroundLocationContext.Provider, { value }, children);
}
