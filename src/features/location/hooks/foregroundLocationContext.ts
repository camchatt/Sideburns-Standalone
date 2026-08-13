import { createContext } from "react";
import type { LocationLifecycleState, LocationReading } from "@/features/location/types/location";

export type ForegroundLocationSession = {
  /** User has opted into foreground location for this app session. */
  optedIn: boolean;
  reading: LocationReading | null;
  state: LocationLifecycleState;
  stateLabel: string;
  enable: () => void;
  /** Restarts an opted-in foreground watch after browser/system settings change. */
  retry: () => void;
  disable: () => void;
};

export const ForegroundLocationContext = createContext<ForegroundLocationSession | null>(null);
