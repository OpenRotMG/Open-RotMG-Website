# OpenRotMG website

Static, game-first website. The homepage boots the preserved 123.5.1 client through Ruffle; multiplayer is not connected yet. Crawlable project text, the About page, canonical metadata, social previews, robots and sitemap provide SEO without putting a landing page before the game.

## Development

Clone the pinned client revision recorded in client-lock.json into the sibling client folder, then:

```sh
SITE_URL=http://127.0.0.1:18924/ CLIENT_DIR=../client npm test
SITE_URL=http://127.0.0.1:18924/ CLIENT_DIR=../client npm run build
python3 -m http.server 18924 --bind 127.0.0.1 --directory dist
```

## Deployment

GitHub Pages deploys on push. The repository's SITE_URL Actions variable must match its public URL. Client assets are copied from the pinned commit during the build, not duplicated in this repo. Change that pin deliberately when integrating a verified client update.

GPL-3.0 covers our website work. The SWF retains third-party provenance and rights; Ruffle's MIT/Apache licenses ship with the runtime. No game backend, accounts, analytics or database are hosted here.
