# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install deps + rebuilds better-sqlite3 for Electron (postinstall)
npm run dev          # Start Vite dev server + Electron simultaneously
npm run build        # Vite production build (outputs to dist/)
npm start            # Run Electron against the production build
npm run typecheck    # TypeScript type check (no emit)
npm run rebuild:native  # Manually rebuild better-sqlite3 for the current Electron version
npm run dist         # Build Windows installer (NSIS) - outputs to release/
```

After changing Electron version or Node ABI, always run `npm run rebuild:native`.

## Building & Distribution

Run `npm run dist` to generate the **Windows installer (.exe)** with:
- ✅ Custom installation directory option
- ✅ Desktop shortcut option
- ✅ Start Menu entry
- ✅ Taskbar pinning option (asked after installation completes)

The installer is saved to `release/Manga Update-<version>.exe`. Requires assets/icon.ico to exist.

## Architecture

This is a two-process Electron app:

**Main process (Node/CommonJS, `electron/*.cjs`)**
- `electron/main.cjs` — app entry, window creation, IPC handlers, auto-sync scheduler (30 min interval), desktop notifications. All `ipcMain.handle` calls live here.
- `electron/preload.cjs` — exposes `window.mangaApi` to the renderer via `contextBridge`. Only whitelisted methods are accessible.
- `electron/db.cjs` — SQLite via `better-sqlite3`. Initialized with `initializeDatabase(app.getPath("userData"))` at startup. Uses `ensureColumn` for non-destructive migrations. All queries use camelCase aliases (snake_case in DB).
- `electron/sync.cjs` — `syncMangaNow(id)` orchestrates one sync for a given manga. Dispatches to MangaDex flow or manual scrape flow based on `manga.source`.
- `electron/mangadex-client.cjs` — MangaDex API calls. Primary base: `api.mangadex.org`, fallback: `api.mangadex.dev`. Chapter lookup uses paginated scan when direct filter fails. Prefers `pt-br` then `en`.
- `electron/scraper.cjs` — HTML scraper for "manual" source mangas. Fetches up to 500 KB of HTML and runs 4 strategies (JSON-LD → slug-filtered links → meta description → generic text) to extract the latest chapter number and URL.

**Renderer process (React + TypeScript, `src/`)**
- `src/App.tsx` — single-component UI built with Material UI. Calls `window.mangaApi.*` for all data operations; never talks to SQLite or the filesystem directly.
- `src/types.ts` — shared TypeScript types (`MangaItem`, `AddMangaPayload`, `ScrapeResult`, `AutoSyncStatus`, `PersistentAlert`) and the `window.mangaApi` global declaration.

**IPC contract** (renderer ↔ main):
All channels prefixed `manga:`. The full list is in `electron/preload.cjs`. Key channels: `manga:add`, `manga:list`, `manga:sync-now`, `manga:update-progress`, `manga:scrape-url`, `manga:auto-sync-status`, `manga:persistent-alert` (push event from main → renderer).

## Data model

Single `mangas` table in SQLite (stored in Electron's `userData/data/manga-update.db`):

| column | notes |
|---|---|
| `source` | `"mangadex"` or `"manual"` |
| `source_url` | MangaDex title page URL or scan site URL |
| `last_chapter` | latest known chapter from sync |
| `latest_chapter_url` | direct reader link for `last_chapter` |
| `current_chapter` | user's reading progress |
| `current_chapter_url` | direct reader link for `current_chapter` |
| `status` | `"active"` or `"paused"` |

New columns are added via `ensureColumn` (never `DROP`/`ALTER` destructively).

## Key behaviours

- **New chapter detection** (`isNewChapterAvailable` in `sync.cjs`): numeric comparison first, then string equality, then date comparison. First sync never fires a notification (no `previousChapter` baseline).
- **Manual manga sync** scrapes `sourceUrl` on each auto-sync cycle. Fails silently if the site requires JavaScript.
- **Chapter URL resolution** for MangaDex mangas: checks cached `currentChapterUrl`/`latestChapterUrl` first, then calls `fetchChapterByNumber` which paginates with up to 60 API requests across two API bases and two language preferences.
- External links are always opened in the system browser (`shell.openExternal`); the Electron window blocks navigation away from the app.
