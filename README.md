<h1><a href="https://openrotmg.org"><img src="readme-icon.png" width="44" height="44" align="absmiddle" alt=""></a> Open RotMG / Website</h1>

One-click play for the recreation of the classic bullethell game.

Development gameplay only. The full 2012 game is still being rebuilt.

[Discord](https://discord.gg/EwZWNzzYwP)

Social image uses historical gameplay from PC Gamer's 2012 review, not the current server: https://www.pcgamer.com/realm-of-the-mad-god-review/

## Running locally

Requires Node 22, Python 3, and the sibling client at the revision in client-lock.json. The build prepares checksum-verified Ruffle.

Serve dist behind the same HTTPS origin as the Rust backend. Proxy /game, /client.swf, /legacy-api/, /sfx/ and /vendor/ to Rust; the backend serves its RSA-patched client and generated runtime.

```
SITE_URL=http://127.0.0.1:18924/ CLIENT_DIR=../client npm test
SITE_URL=http://127.0.0.1:18924/ CLIENT_DIR=../client npm run build
```
