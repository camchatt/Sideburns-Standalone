import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import {
  PLAYA_IMAGERY_TILE_URL,
  resolvePlayaTileSrc,
} from "./offlineTiles";

/**
 * Esri imagery that prefers Cache Storage tiles (phone offline pack),
 * then falls back to network and warms the cache when online.
 */
export function OfflineAwareImageryLayer({
  opacity = 1,
}: {
  opacity?: number;
}) {
  const map = useMap();

  useEffect(() => {
    const OfflineTileLayer = L.TileLayer.extend({
      createTile(this: L.TileLayer, coords: L.Coords, done: L.DoneCallback) {
        const tile = document.createElement("img");
        tile.alt = "";
        tile.setAttribute("role", "presentation");
        tile.crossOrigin = "anonymous";

        const url = this.getTileUrl(coords);
        let objectUrl: string | null = null;

        resolvePlayaTileSrc(url)
          .then((src) => {
            if (src.startsWith("blob:")) objectUrl = src;
            tile.onload = () => {
              done(undefined, tile);
              if (objectUrl) {
                // Revoke after the browser has decoded the image
                window.setTimeout(() => {
                  if (objectUrl) URL.revokeObjectURL(objectUrl);
                }, 30_000);
              }
            };
            tile.onerror = () => {
              if (objectUrl) URL.revokeObjectURL(objectUrl);
              // Last resort: hit the network URL directly
              tile.onload = () => done(undefined, tile);
              tile.onerror = (e) =>
                done(e instanceof ErrorEvent ? e.error : new Error("tile"), tile);
              tile.src = url;
            };
            tile.src = src;
          })
          .catch((err) => {
            done(err instanceof Error ? err : new Error("tile"), tile);
          });

        return tile;
      },
    });

    // Leaflet's extend() typing is incomplete for subclass constructors.
    const LayerCtor = OfflineTileLayer as unknown as {
      new (url: string, options?: L.TileLayerOptions): L.TileLayer;
    };
    const layer = new LayerCtor(PLAYA_IMAGERY_TILE_URL, {
      attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
      opacity,
      maxZoom: 18,
      minZoom: 12,
    });

    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, opacity]);

  return null;
}
