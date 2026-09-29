import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// One source for the version the user sees. The packaging step overrides it
// with the plugin's own version so a shipped bundle cannot advertise the
// project's number while the server and manifest report another.
const version =
  process.env.AI3D_VERSION ||
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))
    .version;

export default defineConfig({
  define: { __AI3D_VERSION__: JSON.stringify(version) },
  base: "./",
  server: { proxy: { "/api": "http://127.0.0.1:43173" } },
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
});
