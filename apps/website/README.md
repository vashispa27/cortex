# Open Memory website

Run `node apps/website/server.mjs` from the repository root and open `http://127.0.0.1:8790`. The site is dependency free and server renders `/`, `/faq`, `/docs`, `/blog`, `/blog/why-sources-matter`, `/privacy`, `/tos`, and `/dpa`. It includes a keyboard-operable synthetic demo, a privacy explainer, sitemap, and platform download routes.

There are no default installer links, testimonials, usage counters, or paid prices. Configure published artifacts through `GF_SITE_CONFIG_FILE` with a JSON file shaped like `site-config.example.json`. Only HTTPS download URLs are accepted. A missing platform returns 404 and the home page shows “installer coming soon.” Set `pricing` only to reviewed public copy; no plan amount is inferred from the control service. `docsUrl` is reserved for a future external docs deployment; this preview uses the local `/docs` page.

The legal pages intentionally describe the current preview and missing production agreements. Review them with actual hosting, provider, telemetry, retention, and billing choices before deployment. The default site binds loopback; production requires TLS at the hosting edge.
