# Release integrity and CI

`release.mjs` creates a versioned manifest for files that already exist on disk. It hashes each nonempty regular artifact with SHA-256, signs the canonical manifest with an externally supplied Ed25519 key, and verifies both the signature and every artifact before exporting any website or control-service URLs. It rejects missing files, symlinks, path traversal, unsigned or altered manifests, wrong keys, changed bytes, non-HTTPS URLs, and version downgrades when an installed version is provided.

The private signing key is **not in this repository**. Supply it through a protected environment variable or a local PEM file outside the checkout. Pin the matching public key and key ID in the update client and release environment. Synthetic tests create ephemeral key pairs; those keys are never release credentials.

## Local commands

```sh
node infra/release.mjs sign \
  --dir /path/to/signed-installers \
  --version 1.2.3 --channel canary --minimum-version 1.0.0 \
  --base-url https://downloads.example.com/open-memory/1.2.3 \
  --download-origin https://downloads.example.com \
  --artifact macos-universal=open-memory-1.2.3.pkg \
  --key-id release-2026 \
  --private-key-file /secure/path/release-private.pem \
  --out /tmp/open-memory-release/manifest.json

node infra/release.mjs verify \
  --dir /path/to/signed-installers \
  --manifest /tmp/open-memory-release/manifest.json \
  --channel canary \
  --key-id release-2026 \
  --public-key-file /secure/path/release-public.pem \
  --installed-version 1.2.2

node infra/release.mjs export-config \
  --dir /path/to/signed-installers \
  --manifest /tmp/open-memory-release/manifest.json \
  --channel canary \
  --download-origin https://downloads.example.com \
  --key-id release-2026 \
  --public-key-file /secure/path/release-public.pem \
  --site-url https://open-memory.example.com \
  --site-out /tmp/open-memory-release/site-config.json \
  --control-out /tmp/open-memory-release/control-releases.json
```

The generated site config maps a verified universal macOS package to `downloads.macos`. The Windows download stays unavailable. `export-config` downloads each file from the declared HTTPS origin and checks its SHA-256 and size against the signed local artifact before it emits any URL. Set `GF_SITE_CONFIG_FILE` and `GF_RELEASES_FILE` to the reviewed outputs only after this succeeds. The control config maps `channel/platform` to the signed manifest and selected artifact. The CLI never overwrites output files.

## Workflows

- `.github/workflows/ci.yml` runs JavaScript, desktop, MCP, release-tool, and Rust workspace tests on pushes and pull requests. It has read-only repository permission and no release keys.
- `.github/workflows/release-manifest.yml` is manual, limited to the repository's default branch and a protected `release` environment. It downloads a `signed-installers` artifact from a named prior run. macOS checks Gatekeeper acceptance, a stapled notarization ticket, and the configured Developer ID team. After that passes, it signs, verifies local and already-published remote bytes, and uploads metadata as a workflow artifact.

Configure these protected environment values before running release preparation: `OPEN_MEMORY_MACOS_TEAM_ID`, `OPEN_MEMORY_RELEASE_KEY_ID`, `OPEN_MEMORY_RELEASE_VERIFY_KEY_PEM`, `OPEN_MEMORY_DOWNLOAD_ORIGIN`, and secret `OPEN_MEMORY_RELEASE_SIGNING_KEY_PEM`. The source artifact must contain the exact `.pkg` basename supplied at dispatch, and the same bytes must already be available under the allowlisted HTTPS origin. A missing value, file, signature, remote file, or cryptographic verification fails the workflow. Release output is a private workflow artifact, not a deployment.

The workflow does not code-sign, notarize, upload to a CDN, roll out updates, or update the live website. Those actions need certificates, hosting credentials, remote-byte verification, and a reviewed rollout process. The desktop updater must pin the public key, check the signature and downloaded file hash before install, enforce its own minimum version and channel policy, and defer restart during active edits or migrations.

Run `node --test infra/test/*.test.mjs` for the synthetic integrity fixtures.
