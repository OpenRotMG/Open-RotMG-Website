## [Open RotMG](https://openrotmg.org)

One-click play for the recreation of the classic bullethell game.

Client preview only for now. Multiplayer is not online yet.

<img width="1194" height="270" alt="image" src="https://github.com/user-attachments/assets/e21e78cf-7009-4fdc-82d0-67e76a50bec7" />

[Discord](https://discord.gg/EwZWNzzYwP)

Social image uses historical gameplay from PC Gamer's 2012 review, not the current server: https://www.pcgamer.com/realm-of-the-mad-god-review/

## Running locally

Requires Node 22, Python 3, and the sibling client at the revision in client-lock.json. The build downloads and verifies Ruffle locally.

```
SITE_URL=http://127.0.0.1:18924/ CLIENT_DIR=../client npm test
SITE_URL=http://127.0.0.1:18924/ CLIENT_DIR=../client npm run build
python3 -m http.server 18924 --bind 127.0.0.1 --directory dist
```
