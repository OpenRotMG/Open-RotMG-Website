# Website build and hosting

The full 2012 game is still being rebuilt. Restoration data lives in `public/restoration/progress.json`; the build validates its gates and calculates the displayed percentages. These are reviewed evidence assignments, not a live backend test report. Artwork provenance and publication limits are in `docs/THIRD_PARTY.md`.

The build and CI use `tools/client-lock.json` to pin the client revision and reference SWF checksum. They prepare Ruffle using the pinned client's `scripts/run.py`. Update the pin and build invocation together when changing the client launcher layout; do not substitute an unpinned working tree.

```sh
SITE_URL=http://127.0.0.1:18924/ CLIENT_DIR=../client npm test
SITE_URL=http://127.0.0.1:18924/ CLIENT_DIR=../client npm run build
```

The build prepares checksum-verified Ruffle. Serve `dist/` behind the same HTTPS origin as the Rust backend. Proxy `/game`, `/client.swf`, `/legacy-api/`, `/sfx/` and `/vendor/` to Rust; the backend serves its RSA-patched client and generated runtime. A static file server alone is not a playable deployment.

The separate `/local/#port=...` page uses the website's Ruffle runtime and a loopback development backend. That backend downloads the pinned reference SWF and serves its own public-key-patched copy; never use production keys locally. Account/API, sounds and WebSocket URLs point only to `127.0.0.1`. Only this page permits local connections in its CSP; the community page is unchanged. The backend accepts the exact hosted origin only in `--hosted-client` mode, with CORS limited to game/client routes, not QA control. Browsers may require local-network permission or reject a transport; the page surfaces failures without switching servers. Test ordinary HTTPS-to-loopback behavior, not browsers with security disabled.
