import { test } from "node:test";
import assert from "node:assert/strict";
import { preview } from "vite";
import { fileURLToPath } from "node:url";

test("production page serves with working local assets and section links", async (t) => {
  const server = await preview({
    root: fileURLToPath(new URL("..", import.meta.url)),
    preview: { host: "127.0.0.1", port: 0 },
  });
  t.after(() => new Promise((resolve) => server.httpServer.close(resolve)));
  const base = server.resolvedUrls.local[0];
  const response = await fetch(base);
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const match of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)) {
    const asset = await fetch(new URL(match[1], base));
    assert.equal(asset.status, 200, match[1]);
    assert.ok(
      !(await asset.text()).startsWith("<!doctype"),
      `Asset resolves to its own content: ${match[1]}`,
    );
  }
  for (const match of html.matchAll(/href="#([^"]+)"/g))
    assert.ok(html.includes(`id="${match[1]}"`), `Section ${match[1]} exists`);
  assert.match(html, /ILLUSTRATIVE DEMO/);
  assert.match(html, /public installer isn't available yet/);
});
