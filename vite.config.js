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
  /* Everything the workbench needs is in one entry: it loads index.html, then
     the bundle, then renders. There is no dynamic import to split on, because
     the generator, the viewer, the chat and the export panel are all on screen
     together from the first paint, and pulling any of them out would trade a
     400 kB gzip download for a second round trip the user waits on. So the
     bundle is ~1.39 MB and this limit is where that is declared rather than
     discovered as a warning on every build. */
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
