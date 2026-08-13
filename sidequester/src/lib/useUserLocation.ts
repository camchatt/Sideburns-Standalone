import { useEffect, useState } from "react";
import type { UserLocation } from "@artelier/playa-core";

/**
 * Live GPS for quest check-ins and presence — no authored-hunt ring state.
 */
export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? 999,
        });
      },
      () => {
        /* keep last fix */
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return location;
}
