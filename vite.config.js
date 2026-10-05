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
  // The service answers a write only when the request's `Origin` and `Host`
  // agree, which is what keeps a page on another site from driving it. The
  // string shorthand turns on `changeOrigin`, rewriting `Host` to the service's
  // own port while the browser's `Origin` still names this one -- every POST
  // through the dev server then came back "This request did not come from the
  // current workbench" and no setting could be saved while developing. Leaving
  // `Host` as the browser sent it keeps the two in agreement.
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:43173", changeOrigin: false },
    },
  },
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
});
