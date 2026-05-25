# 454-Videos

## Project structure

```
server/          Express.js backend (port 3000)
  server.js       Main server - API + static file serving + video processing
  package.json    "npm start" → node server.js
  uploads/        Gitignored - video files and thumbnails
  database.json   Gitignored - JSON-file DB ({users, videos})
client/          Vite 8 multi-page vanilla JS frontend
  src/routes/     HTML pages (flat, one per route)
  public/         Static assets served as-is (app.js, styles.css)
  vite.config.js  MPA config + route rewriting + proxy to server:3000
  package.json    "npm run dev" → vite, "npm run build" → vite build
```

## Commands

- **Dev frontend**: `cd client && npm run dev` (starts Vite on :5173)
- **Dev backend**: `cd server && npm start` (starts Express on :3000)
- **Build**: `cd client && npx vite build` (outputs to `client/dist/`)
- **Production**: `cd client && npm run build && cd ../server && npm start`

## Architecture notes

- **Multi-page vanilla JS app** — not SPA. Each route is a separate HTML file in `src/routes/` served as a full page load. No framework/router — global functions in `public/app.js` handle auth/DOM interactions.
- **Vite dev server** rewrites clean URLs (/login → /src/routes/login.html) via custom middleware in `vite.config.js`. API calls (/api/_, /uploads/_) proxy to Express on :3000.
- **Express server** serves built client files from `../client/dist/` with `extensions: ["html"]` (so /login resolves to login.html) plus `../client/public/` as fallback. Build client before starting server.
- **No TypeScript** — plain JS, no typecheck or lint steps.
- **auth** — localStorage `currentUser` key, credentials stored in plaintext in `database.json`.
- **DB** — `database.json` is read/written synchronously on each request (no cache). Migrations run on startup via `migrateDB()`.
- **Uploads** — chunked upload via multipart forms, reassembled in `uploads/`, then ffmpeg-processed (thumbnail + compress to H.264).
- **Output chunks / dist/ css** — Vite build emits flat HTML, copied `public/` assets, and CSS to `client/dist/`. No JS chunk transformation since there are no JS imports.

## Gotchas

- `client/` has its own `package.json`; `server/` has its own. Install separately.
- `server/database.json` is gitignored. It's created on first `npm start` with empty `{users: [], videos: []}`.
- When editing HTML, the `<script src="/app.js">` tag must remain a classic script (not module) — app.js defines global functions for inline `<script>` tags.

Don't start your own development server, always assume one is running.
Always use bun.
