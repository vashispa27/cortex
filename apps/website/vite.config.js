import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        launch: fileURLToPath(new URL("./launch.html", import.meta.url)),
        notchFilm: fileURLToPath(new URL("./notch-film.html", import.meta.url)),
      },
    },
  },
});
