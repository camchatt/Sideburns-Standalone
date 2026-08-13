import { useContext } from "react";
import {
  ForegroundLocationContext,
  type ForegroundLocationSession,
} from "@/features/location/hooks/foregroundLocationContext";

export type { ForegroundLocationSession };

export function useForegroundLocation(): ForegroundLocationSession {
  const ctx = useContext(ForegroundLocationContext);
  if (!ctx) {
    throw new Error("useForegroundLocation must be used within ForegroundLocationProvider");
  }
  return ctx;
}
