import type { CapacitorConfig } from "@capacitor/cli";

const isLiveReload = process.env.CAPACITOR_LIVE_RELOAD === "true";

const config: CapacitorConfig = {
  appId: "fr.vibeidfm.transportclock",
  appName: "Transport Clock IDFM",
  webDir: "dist/capacitor",
  // Android Emulator reaches the development machine through 10.0.2.2.
  // This is enabled only by the dedicated sync command below, never in builds.
  server: isLiveReload
    ? {
        url:
          process.env.CAPACITOR_LIVE_RELOAD_URL ??
          "http://10.0.2.2:5173",
        cleartext: true,
      }
    : undefined,
  plugins: {
    // Use the native HTTP stack in the mobile WebView. This lets the app call
    // the hosted Nuxt API without being blocked by browser CORS rules.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
