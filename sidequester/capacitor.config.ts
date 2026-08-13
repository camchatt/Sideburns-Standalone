import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.sideburns.sidequester",
  appName: "Sidequester",
  webDir: "dist",
  server: {
    // Capacitor serves the built web assets from the app bundle.
    androidScheme: "https",
  },
  ios: {
    contentInset: "never",
    preferredContentMode: "mobile",
    backgroundColor: "#17130f",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#17130f",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#17130f",
    },
  },
};

export default config;
