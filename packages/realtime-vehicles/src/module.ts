import { fileURLToPath } from "node:url";
import { defineTransportClockPlugin } from "@transport-clock/nuxt-plugin-host/types";

const resolve = (relativePath: string) =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineTransportClockPlugin({
  apiVersion: 1,
  id: "idfm-realtime-vehicles",
  version: "1.0.0",
  metadata: {
    author: "Transport Clock",
    name: {
      en: "Realtime vehicle visualization",
      fr: "Visualisation des transports en temps réel",
    },
    description: {
      en: "Animated estimates of guided vehicle positions on line diagrams.",
      fr: "Estimation animée de la position des transports guidés sur les schémas de ligne.",
    },
  },
  register(context) {
    const clientEntry = resolve("./runtime/client/index.ts");

    context.addClientEntry(clientEntry);
    context.addCss(resolve("./runtime/style.css"));
    context.addHealthCheck(resolve("./runtime/server/healthCheck.ts"));
    context.addServerHandler({
      route: "/api/lines/:transportType/:lineId/vehicles",
      handler: resolve("./runtime/server/vehicles.get.ts"),
      method: "get",
    });
  },
});
