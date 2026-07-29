# Owling Center

Native desktop control panel for developers — automate project startup, stream logs, monitor ports, track Git, link Jira, and keep project to-dos close.

**Brand:** Owling Center — *The power of wisdom*

## Requirements

- Node.js 20+
- Windows recommended (WAMP/XAMPP & MySQL `net start` adapters)
- VS Code `code` CLI on PATH (or set another IDE command per project)

## Setup

```bash
npm install
npm run dev
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Electron + Vite HMR |
| `npm run build` | Typecheck + production build |
| `npm run build:win` | Package Windows installer |

## Branding assets

| File | Use |
|------|-----|
| [`resources/logo_transparrent.png`](resources/logo_transparrent.png) | App / window icon (transparent) |
| [`resources/logo_white.png`](resources/logo_white.png) | Logo on white background |
| [`resources/splash_screen.png`](resources/splash_screen.png) | Splash shown ≥1s on launch |
| [`build/icon.ico`](build/icon.ico) | Windows installer / executable icon |

## Features

1. **Launch pipeline** — service pre-check → IDE multi-folder open → background commands
2. **Log drawer + Stop All** — live stdout/stderr with tree-kill cleanup
3. **Port health** — polling + Force Free Port
4. **Git quick-view** — multi-folder branch, dirty, ahead/behind
5. **Contextual todos & session notes** — SQLite-backed, filtered by selected project
6. **Jira overlay** — To Do / In Progress / In Review, Mine vs All, branches from `dev`, status transitions
7. **Quick actions** — configurable URL / program / command buttons
8. **Backup & restore** — export/import projects + settings as JSON
9. **Autostart** — optional login item via Settings
10. **Splash screen** — Owling branding on startup (≥1 second)

## Jira setup

1. Create an [Atlassian API token](https://id.atlassian.com/manage-profile/security/api-tokens)
2. **App settings** → enable Jira, set site URL, email, and token → **Test connection**
3. Edit a project → set **Jira project key**; optional custom JQL
4. Select the project — filter **Assigned to me** / **All tickets**
5. Select a ticket → open, create branches from `dev`, or move status
6. Use **To Jira** on a session note to create a Task

Credentials stay in local `electron-store` (main process only).

## Data

- Project config: `electron-store` (JSON under Electron `userData`)
- Todos / session notes: SQLite via `sql.js` (WASM; file at `userData/devcenter.sqlite`)

> Note: The blueprint suggested `better-sqlite3`. This build uses `sql.js` so the app runs without Visual Studio native rebuilds on Windows.
