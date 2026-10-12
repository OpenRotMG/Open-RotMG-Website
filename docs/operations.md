# Website build and hosting

The full 2012 game is still being rebuilt. Restoration data lives in `public/restoration/progress.json`; the build validates its gates and calculates the displayed percentages. These are reviewed evidence assignments, not a live backend test report. Artwork provenance and publication limits are in `docs/THIRD_PARTY.md`.

The build and CI use `tools/client-lock.json` to pin the client revision and reference SWF checksum. They prepare Ruffle using the pinned client's `scripts/run.py`. Update the pin and build invocation together when changing the client launcher layout; do not substitute an unpinned working tree.

```sh
SITE_URL=http://127.0.0.1:18924/ CLIENT_DIR=../client npm test
SITE_URL=http://127.0.0.1:18924/ CLIENT_DIR=../client npm run build
```

The build prepares checksum-verified Ruffle. Serve `dist/` behind the same HTTPS origin as the Rust backend. Proxy `/game`, `/client.swf`, `/legacy-api/`, `/sfx/` and `/vendor/` to Rust; the backend serves its RSA-patched client and generated runtime. A static file server alone is not a playable deployment.
