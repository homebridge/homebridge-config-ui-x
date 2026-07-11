# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This is a monorepo with two npm packages that ship together as the `homebridge-config-ui-x` plugin:

- **`/` (root)** — Nest.js backend (TypeScript, ESM, Fastify adapter). Compiles to `dist/`. Requires Node `^22.12.0 || ^24.0.0`.
- **`/ui`** — Angular 22 frontend (private package). Compiles to `public/` (served as static assets by the backend — `outputPath` in `ui/angular.json` is `../public`).

The UI package has its own `package.json`, `node_modules`, and tsconfig. **You must `npm install` in both root and `ui/` separately.**

## Common commands

Run from the repo root unless noted.

```sh
# First-time setup
npm install && npm install --prefix ui

# Full build (server + ui)
npm run build               # ~30s; runs build:server then build:ui
npm run build:server        # tsc -p tsconfig.build.json → dist/
npm run build:ui            # ng build production → public/ (prebuild regenerates the Font Awesome subset)

# Dev (live reload, two processes via concurrently)
npm run watch               # UI dev server on :4200, backend on :8581

# Lint (eslint flat config, antfu base, max-warnings=0; covers both packages)
npm run lint
npm run lint:fix

# Tests — Vitest e2e, ~45s full suite, runs against real Nest module instances
npm run test
npm run test -- test/e2e/auth.e2e-spec.ts          # single file
npm run test -- -t "should reject invalid login"   # single test by name
npm run test-coverage

# Translation key sync (en.json is the master)
npm run lang-sync
```

## Three entry points to understand

The plugin can be loaded three ways, and each goes through a different bootstrap path. This is unusual and worth knowing before navigating `src/bin/`:

1. **As a Homebridge plugin** (`src/index.ts`) — Homebridge calls `registerPlatform`. The plugin class does almost nothing; it just sets `UIX_CONFIG_PATH`/`UIX_STORAGE_PATH` env vars from the Homebridge API. The actual UI server is launched by Homebridge as a separate child process via `src/bin/fork.ts`, which then loads `main.ts`.
2. **Via `hb-service`** (`src/bin/hb-service.ts`, exposed as the `hb-service` bin) — the supported way to run Homebridge as an OS service on Linux/macOS/Windows/FreeBSD. `hb-service run` forks both Homebridge itself and the UI, manages restarts, and pipes logs. Platform-specific installers live in `src/bin/platforms/{darwin,linux,win32,freebsd}.ts`.
3. **Standalone** (`src/bin/standalone.ts`) — for development or `npm run start`. Just sets `UIX_STORAGE_PATH` then imports `main.js`.

All three eventually call `bootstrap()` in `src/main.ts`, which builds the Nest app on Fastify, registers helmet/multipart/CSP, mounts the SPA at `/`, the API at `/api`, Swagger at `/swagger`, a Socket.io gateway under namespace `app`, and (optionally) advertises the UI over mDNS/Bonjour.

## Backend ↔ Homebridge IPC

The UI doesn't import Homebridge as a library — it talks to the running Homebridge process over Node IPC. The bridge is `src/core/homebridge-ipc/homebridge-ipc.service.ts`, which extends `EventEmitter` and is wired up by `hb-service` after it forks Homebridge (it calls `setHomebridgeProcess()` on the exported `HomebridgeIpcService` from `main.ts`). Events like `childBridgeStatusUpdate` and `serverStatusUpdate` flow through this service to the rest of the app and out via WebSocket gateways.

When standalone or in dev watch mode (`npm run watch`), there's no Homebridge process attached, so IPC-dependent features (child bridge controls, restart, log tail) won't work end-to-end — that's expected.

## Backend module layout

`src/app.module.ts` imports feature modules from `src/modules/` and infrastructure from `src/core/`:

- **`core/`** — cross-cutting: `auth` (JWT + passport, HTTP guards plus WS guards in `guards/`), `config` (loads/parses `config.json`, holds runtime env detection — Docker/Synology/RPi/etc.), `feature-flags`, `fs`, `homebridge-ipc`, `logger`, `matter` (interfaces), `node-pty` (terminal), `scheduler`, `spa` (catch-all filter so non-`/api` routes serve `index.html`), `ssl`.
- **`modules/`** — one folder per feature surface, each with a `*.module.ts`, controller, service, gateway (when WS-enabled), and DTOs. The set is: `accessories`, `backup`, `child-bridges`, `config-editor`, `custom-plugins`, `log`, `platform-tools`, `plugins`, `server`, `setup-wizard`, `status`, `users`.

## Frontend layout

`ui/src/app/` splits into `core/` (singletons, guards, interceptors), `modules/` (routed feature areas), and `shared/`:

- **`core/communication/`** — `api.service.ts` (HTTP wrapper for `/api`), `ws.service.ts` (socket.io-client), `notification.service.ts`. JWT handling lives in `core/auth/` (via `@auth0/angular-jwt`).
- **`modules/`** — mirror the backend feature modules (`config-editor`, `plugins`, `status`, `users`, `platform-tools`, …). When adding a feature, expect to touch a backend module + its UI counterpart.
- In dev mode, `ui/src/environments/environment.ts` hard-codes the backend at port `8581` on the current hostname — that's why `npm run watch` runs the backend on 8581.
- Notable UI libs: ng-bootstrap + Bootstrap 5, Monaco editor (`ngx-monaco-editor-v2`) for the config editor, xterm for the terminal, `@ng-formworks/*` for plugin settings forms (JSON schema → form).

## Testing

Tests are e2e, not unit: each spec builds a real Nest `TestingModule` for the module under test, backed by a real temp storage dir (`test/.homebridge`, seeded from fixtures in `test/mocks/`). Vitest compiles them with SWC (`unplugin-swc`). `vitest.config.js` sets `fileParallelism: false` — specs share filesystem state (storage paths, `config.json`) and must run serially. Don't expect fast isolated unit-test feedback; expect ~45s for the full suite.

## Key environment variables

These drive runtime behaviour and are set by `hb-service`, the watch script, or the user's environment. Most are read in `src/core/config/config.service.ts`:

- `UIX_CONFIG_PATH`, `UIX_STORAGE_PATH` — Homebridge config + storage roots (required).
- `UIX_BASE_PATH` — plugin install root (where `public/` is served from).
- `UIX_INSECURE_MODE=1` — skip auth (dev/testing).
- `UIX_DEVELOPMENT=1` — verbose logging, dev CORS.
- `UIX_SERVICE_MODE=1` — running under hb-service (enables IPC features).
- `UIX_CUSTOM_PLUGIN_PATH` — extra location to scan for plugins.
- `HOMEBRIDGE_CONFIG_UI=1` (Docker), `HOMEBRIDGE_SYNOLOGY_PACKAGE=1`, `HOMEBRIDGE_APT_PACKAGE=1` — packaging-mode flags that toggle features like terminal access and host shutdown/restart.

`nodemon.json` shows the canonical dev invocation: `UIX_DEVELOPMENT=1 UIX_INSECURE_MODE=1 UIX_SERVICE_MODE=1 HOMEBRIDGE_CONFIG_UI_TERMINAL=1 tsx src/bin/hb-service.ts run --stdout`.

## Pull request convention

**Always target the current beta branch (e.g. `beta-5.24.1`), never `latest` or `main`.** Find it with `git branch -a | grep beta`. This is enforced by project policy — bug fixes and features go through the beta branch first, only release commits land on `latest`.

## Things that bite

- **ESM throughout**: both packages have `"type": "module"`. Local imports must use the `.js` extension even from `.ts` source (e.g. `import { Foo } from './foo.js'`). The compiled output is what runs.
- **Two `node_modules`**: if you change a dep in `ui/package.json`, run `npm install --prefix ui` — root `npm install` won't touch it.
- **Built UI is gitignored but shipped on publish**: `public/` is the compiled UI. It is in `.gitignore`, so `npm run build:ui` won't show up in `git status` — don't expect (or try to commit) a `public/` diff. It still reaches the npm package: `prepublishOnly` runs `npm run build` to regenerate it, and `.npmignore` (which npm uses in preference to `.gitignore` because it exists) does not exclude `public/`.
- **Translations**: `ui/src/i18n/en.json` is the source of truth; other locales are synced from it via `npm run lang-sync`. Don't hand-edit non-English files for new keys.
- **Patched dependencies**: the UI runs `patch-package` on postinstall; patches for `@ng-formworks/*` live in `ui/patches/`. If you bump one of those packages, the patch must be re-created or it will fail to apply.
- **Install-script allow-list**: both `package.json` files have an `allowScripts` block (npm's install-script approval). Approvals are pinned to exact versions, so bumping an approved package (e.g. `esbuild`) makes npm prompt again — re-approve with `npm install-scripts approve <pkg>`.
