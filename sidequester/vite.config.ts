import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  // Relative asset URLs work in Capacitor's local webview host.
  base: "./",
  build: {
    // leaflet-rotate side-effect import can emit top-level await.
    target: "es2022",
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-leaflet": ["leaflet", "react-leaflet", "leaflet-rotate"],
          "vendor-icons": ["lucide-react", "react-icons"],
        },
      },
    },
  },
  server: {
    host: "::",
    port: 8090,
    strictPort: true,
  },
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      {
        find: /^@artelier\/playa-core$/,
        replacement: path.resolve(
          __dirname,
          "../packages/playa-core/src/index.ts",
        ),
      },
      {
        find: /^@artelier\/playa-core\/(.*)$/,
        replacement: path.resolve(__dirname, "../packages/playa-core/src/$1"),
      },
    ],
    dedupe: ["react", "react-dom", "leaflet", "react-leaflet"],
  },
  optimizeDeps: {
    include: ["leaflet", "react-leaflet", "leaflet-rotate"],
  },
});
