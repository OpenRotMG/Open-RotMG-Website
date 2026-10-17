# Website build and hosting

The full 2012 game is still being rebuilt. Restoration data lives in `public/restoration/progress.json`; the build validates its gates and calculates the displayed percentages. These are reviewed evidence assignments, not a live backend test report. Artwork provenance and publication limits are in `docs/THIRD_PARTY.md`.

Every `main` push to the website or client builds and deploys both latest revisions. Client changes rehearse against saved state, back up, warn players and restart the game; website-only changes do not restart it. Ruffle remains checksum-verified by the client's dependency lock.

```sh
SITE_URL=http://127.0.0.1:18924/ CLIENT_DIR=../client npm test
SITE_URL=http://127.0.0.1:18924/ CLIENT_DIR=../client npm run build
```

The build prepares checksum-verified Ruffle. Serve `dist/` behind the same HTTPS origin as the Rust backend. Proxy `/game`, `/client.swf`, `/legacy-api/`, `/sfx/` and `/vendor/` to Rust; the backend serves its RSA-patched client and generated runtime. A static file server alone is not a playable deployment.

Local development is served entirely by the local backend: the server's `./run.sh` downloads and prepares the client automatically. No hosted website connection or local-network permission is needed.
