import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const idfmApiKey = env.IDFM_API_KEY ?? "";

  return {
    define: {
      __IDFM_API_KEY_CONFIGURED__: JSON.stringify(Boolean(idfmApiKey.trim())),
    },
    plugins: [vue()],
    server: {
      port: 5173,
      proxy: {
        "/api/idfm": {
          target: "https://prim.iledefrance-mobilites.fr/marketplace",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/idfm/, ""),
          headers: {
            apikey: idfmApiKey,
          },
        },
      },
    },
  };
});
