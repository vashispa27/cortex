// Compatibility entry point for `node apps/website/server.mjs`.
// Vercel serves the Vite build as static assets; no production Node server is needed.
import { createServer } from "vite";
const server = await createServer({
  root: new URL(".", import.meta.url).pathname,
  server: { host: "127.0.0.1", port: 8790 },
});
await server.listen();
server.printUrls();
