<h1><a href="https://openrotmg.org"><img src=".github/readme-icon.png" width="44" height="44" align="absmiddle" alt=""></a> Open RotMG / Website</h1>

Game-first website for the Open RotMG recreation of Realm of the Mad God.

Developing the server? Its `./run.sh` downloads the client and serves the whole game locally. See https://github.com/OpenRotMG/Open-RotMG-Server for setup.

## Build locally

Requires Node 22, Python 3, and a sibling `client` checkout at the revision in `tools/client-lock.json`.

```sh
SITE_URL=http://127.0.0.1:18924/ CLIENT_DIR=../client npm run build
```

Output is in `dist/`. Serving the playable site with the backend is described in `docs/operations.md`.

---

Join Discord: https://discord.gg/EwZWNzzYwP
