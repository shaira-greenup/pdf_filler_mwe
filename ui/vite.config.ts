import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

// server.fs.allow reaches one level up so Vite can serve forms/<id>/blank-form.pdf
// and forms/<id>/fields.txt straight from their real, single-source-of-truth
// location - no duplicate copies of either committed under ui/.
export default defineConfig({
  plugins: [solid(), tailwindcss()],
  server: {
    fs: {
      allow: [".."],
    },
  },
});
