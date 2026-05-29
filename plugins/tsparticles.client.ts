import { loadSlim } from "@tsparticles/slim";
import Particles from "@tsparticles/vue3";

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(Particles, {
    init: async (engine) => {
      await loadSlim(engine);
    },
  });
});
