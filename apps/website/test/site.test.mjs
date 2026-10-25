import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWebsite } from '../server.mjs';

async function site(t, config = { siteUrl: 'http://localhost:8790', pricing: null, downloads: {} }) {
  const server = createWebsite(config);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

test('all content routes and assets render', async (t) => {
  const base = await site(t);
  for (const path of ['/', '/faq', '/docs', '/blog', '/blog/why-sources-matter', '/privacy', '/tos', '/dpa', '/styles.css', '/site.js', '/sitemap.xml']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.ok((await response.text()).length > 100, path);
  }
});

test('no unconfigured download redirect or fabricated price', async (t) => {
  const base = await site(t);
  const home = await (await fetch(base)).text();
  assert.match(home, /installer coming soon/);
  assert.match(home, /Pricing will be announced/);
  assert.equal((await fetch(base + '/download/macos', { redirect: 'manual' })).status, 404);
});

test('configured HTTPS artifact redirects and pricing is displayed', async (t) => {
  const base = await site(t, { siteUrl: 'https://example.invalid', pricing: 'Private beta is free.', downloads: { macos: 'https://example.invalid/cortex.pkg' } });
  const home = await (await fetch(base)).text();
  assert.match(home, /Private beta is free/);
  const download = await fetch(base + '/download/macos', { redirect: 'manual' });
  assert.equal(download.status, 302);
  assert.equal(download.headers.get('location'), 'https://example.invalid/cortex.pkg');
});
