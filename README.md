# kK Baseball

Call the pitch before it is thrown, beat the book, and learn how a pitcher really works.

## Put it on GitHub Pages

1. Create a public repository (for example `kk-baseball`) and upload everything in this folder, including the hidden `.github` folder.
2. In the repository, open Settings, then Pages, and set the source to the `main` branch and the root folder.
3. Open Actions, choose "Build pitcher books", and click "Run workflow" once. It writes `books.json`, then runs every morning and early afternoon on its own.
4. On your phone, open the Pages link in Safari, tap Share, then Add to Home Screen.

## Game day

- Open kK on Wi-Fi before first pitch so every pitcher's book is ready.
- Tap the live game, then tap Pitch at the release on three pitches in a row to sync to your TV. Calls open once the sync lands.
- To change the team, edit `144` in `.github/workflows/books.yml` and pick your colors in Settings.

## Files

- `index.html` is the whole app.
- `tools/build-books.mjs` and `tools/engine.js` build `books.json` from MLB's public stats service.
- `manifest.webmanifest` and the icons make it install like an app.
- `brand/` holds the logo in primary, light, one-color and small cuts.

MLB's stats service is free for personal use. A commercial version would need a licensed data feed.
