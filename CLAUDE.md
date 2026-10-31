# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This is a monorepo with two npm packages that ship together as the `homebridge-config-ui-x` plugin:

- **`/` (root)** — Nest.js 12 backend (TypeScript, ESM, Fastify adapter). Compiles to `dist/`. Requires Node `^22.12.0 || ^24.0.0 || ^26.0.0`.
- **`/ui`** — Angular 22 frontend (private package). Compiles to `public/` (served as static assets by the backend — `outputPath` in `ui/angular.json` is `../public`).

The UI package has its own `package.json`, `node_modules`, and tsconfig. **You must `npm install` in both root and `ui/` separately.**

## Common commands

Run from the repo root unless noted. Script names follow a `:server` / `:ui` pattern, and the bare name runs both.

```sh
# First-time setup
npm install && npm install --prefix ui

# Build
npm run build               # build:server then build:ui
npm run build:server        # tsc -p tsconfig.build.json → dist/
npm run build:ui            # ng build production → public/ (prebuild regenerates the Font Awesome subset,
                            # postbuild:ui checks the Monaco assets were copied)

# Dev (live reload, two processes via concurrently)
npm run watch               # UI dev server on :4200, backend (hb-service + Homebridge) on :8581
npm start                   # backend only, no Homebridge: tsx src/main.ts (port 8080 if config has none)

# Lint (eslint flat config, antfu base, max-warnings=0; covers both packages)
npm run lint
npm run lint:fix

# Tests
npm run test                # test:server then test:ui
npm run test:server         # backend e2e suite (Vitest), ~60s
npm run test:ui             # frontend unit tests (ng test → Vitest), ~30s
npm run test-coverage       # both, with coverage
npm run test:server -- test/e2e/auth.e2e-spec.ts            # one backend file
npm run test:server -- -t "should reject invalid login"     # one backend test by name
npm run test:ui -- --include src/app/core/pipes/convert-temp.pipe.spec.ts   # one UI file (path relative to ui/)

# Outdated deps (installs first)
npm run check               # check:server then check:ui

# Translation key sync (en.json is the master)
npm run lang-sync
```

**npm 12 passes `--` arguments through only one level.** `test:ui` is `npm run test --prefix ui --` (note the trailing `--`) so that flags like `--include` and `--coverage` reach `ng test`. Without it, npm eats `--include` as its own option and runs all files, and `--coverage` fails with "Unknown cli flag". Keep the trailing `--` on any script that forwards to another package's script.

## How the UI gets started

There are two real start paths. Read this before navigating `src/bin/`:

1. **Via `hb-service`** (`src/bin/hb-service.ts`, the `hb-service` bin) — the normal way, and what `npm run watch` uses. It sets the `UIX_*` env vars, then:
   - runs the UI **in the same process**: `runUi()` does `await import('../main.js')` and keeps the `HomebridgeIpcService` from the Nest app;
   - forks Homebridge as a child process (`runHomebridge()`), with `UIX_SERVICE_MODE=1` set.
   - Platform installers (install/uninstall/start/stop as an OS service) live in `src/bin/platforms/{darwin,linux,win32,freebsd}.ts`.
2. **Standalone** — `npm start` runs `src/main.ts` directly. No Homebridge, no IPC.

The **Homebridge plugin entry** (`src/index.ts`) registers the `config` platform, but the class only copies Homebridge's paths and CLI flags into `UIX_*` env vars. It does **not** start a server. Homebridge core itself skips the `config` platform when `UIX_SERVICE_MODE=1` (see `homebridge/src/server.ts`), so under hb-service it is not loaded at all.

`src/bin/fork.ts` and `src/bin/standalone.ts` are leftovers — nothing imports `fork.ts`, and `standalone.ts` is only named in a debug log line.

`src/main.ts` runs `bootstrap()` at import time (`export const app = bootstrap()`). It builds the Nest app on Fastify, registers helmet/multipart/CSP, mounts the SPA at `/`, the API at `/api`, Swagger at `/swagger`, Socket.io gateways under namespace `app`, and (optionally) advertises the UI over mDNS/Bonjour. `src/env-setup.ts` sets `UIX_BASE_PATH` before anything else loads.

## Backend ↔ Homebridge IPC

The UI doesn't import Homebridge as a library — it talks to the running Homebridge process over Node IPC. The bridge is `src/core/homebridge-ipc/homebridge-ipc.service.ts` (an `EventEmitter`); hb-service calls `setHomebridgeProcess()` on it after each fork. Events like `childBridgeStatusUpdate` and `serverStatusUpdate` flow through it to the rest of the app and out via WebSocket gateways.

With `npm start` there's no Homebridge process attached, so IPC features (child bridge controls, restart, log tail) won't work end-to-end — that's expected. `npm run watch` does run Homebridge.

## Backend module layout

`src/app.module.ts` imports feature modules from `src/modules/` and infrastructure from `src/core/`:

- **`core/`** — cross-cutting: `auth` (JWT + passport, HTTP guards plus WS guards in `guards/`), `config` (loads/parses `config.json`, runtime env detection — Docker/Synology/RPi/etc.; `config.startup.ts` reads startup options), `feature-flags`, `fs`, `homebridge-ipc`, `logger`, `matter` (interfaces), `node-pty` (terminal), `scheduler`, `spa` (catch-all filter so non-`/api` routes serve `index.html`), `ssl`.
- **`modules/`** — one folder per feature surface, each with a `*.module.ts`, controller, service, gateway (when WS-enabled), and DTOs: `accessories`, `backup`, `child-bridges`, `config-editor`, `custom-plugins`, `log`, `platform-tools`, `plugins`, `server`, `setup-wizard`, `status`, `update-all`, `users`.

## Frontend layout

`ui/src/app/` splits into `core/` (singletons, guards, interceptors, shared components/pipes), `modules/` (routed feature areas), and `shared/`:

- **`core/communication/`** — `api.service.ts` (HTTP wrapper for `/api`), `ws.service.ts` (socket.io-client), `notification.service.ts`. JWT handling lives in `core/auth/` (via `@auth0/angular-jwt`); route guards in `core/auth/guards/`.
- **`core/`** also holds `accessories`, `plugins` and `update-all` services, `ui/` (`settings.service.ts`, `monaco-editor.service.ts`), `components`, `directives`, `pipes`, `helpers`, `utilities`, `caching`, `providers`.
- **`modules/`** — `accessories`, `config-editor`, `login`, `logs`, `platform-tools`, `plugins`, `power-options`, `restart`, `settings`, `setup-wizard`, `status`, `support`, `users`. When adding a feature, expect to touch a backend module + its UI counterpart.
- In dev mode, `ui/src/environments/environment.ts` hard-codes the backend at port `8581` on the current hostname — that's why `npm run watch` runs the backend on 8581.
- Notable UI libs: ng-bootstrap + Bootstrap 5, Monaco editor (`ngx-monaco-editor-v2`) for the config editor, xterm for the terminal, `@ng-formworks/*` for plugin settings forms (JSON schema → form).

## Testing

**Backend (`test:server`)** — e2e specs in `test/e2e/*.e2e-spec.ts`. Each builds a real Nest `TestingModule` for the module under test, backed by a real storage dir (`test/.homebridge`, seeded from `test/mocks/`). Vitest compiles them with SWC (`unplugin-swc`). `vitest.config.js` sets `fileParallelism: false` — specs share filesystem state and must run serially.

- `test/global-setup.ts` snapshots `test/.homebridge` before the run and restores it after. That folder is **also the storage `npm run watch` uses**, so don't run the server suite while watch is running.
- `test/.homebridge/plugins/node_modules` holds plugin fixtures and is git-ignored. A fresh clone or `git archive` copy without it fails the backup tests — copy it across.

**Frontend (`test:ui`)** — unit specs next to the code (`ui/src/**/*.spec.ts`), run by Angular's `@angular/build:unit-test` builder with the Vitest runner in jsdom.

- Shared toolkit in `ui/src/testing/`, imported as `@/testing` (fakes for api/auth/ws/settings/modal/toastr/terminal, fixtures, constants). `provideFakes` and `provideTestTranslate` come from `@/testing/providers` — kept out of the barrel so plain-function specs don't load the app.
- `ui/vitest-base.config.ts` sets `isolate: true`. **Keep it** — without it a `vi.mock` only works if that spec happens to import the module first.
- A component that starts injecting `ApiService` (or anything that makes a request) must have it faked in its spec, or the request never settles and **every** test in the file times out — it looks like the whole file broke.
- A helper that rebuilds the TestBed must call `TestBed.resetTestingModule()` first.

CI: `validate.yml` runs `test:server` on the OS/Node matrix and the UI tests in a separate single "Test UI" job.

## Key environment variables

Set by `hb-service`, the watch script, Docker/packages, or the user. Most are read in `src/core/config/config.service.ts`:

- `UIX_CONFIG_PATH`, `UIX_STORAGE_PATH` — Homebridge config + storage roots (required).
- `UIX_BASE_PATH` — the UI's own install folder (where `public/` is served from). `UIX_BASE_PATH_OVERRIDE` replaces the computed value.
- `UIX_PLUGIN_NAME` — the plugin name from the `config` platform block.
- `UIX_INSECURE_MODE=1` — skip auth (dev/testing). `HOMEBRIDGE_INSECURE=1` is the old Docker flag for Homebridge's own insecure mode.
- `UIX_DEVELOPMENT=1` — verbose logging, dev CORS. `UIX_DEBUG_LOGGING` mirrors the UI's `debug` config option.
- `UIX_SERVICE_MODE=1` — running under hb-service (enables IPC features; makes Homebridge skip the `config` platform).
- `UIX_CUSTOM_PLUGIN_PATH` — extra location to scan for plugins. `UIX_STRICT_PLUGIN_RESOLUTION=1` — from hb-service `--strict-plugin-resolution`.
- `UIX_LOG_NO_TIMESTAMPS=1` — from `-T`.
- `UIX_USE_PLUGIN_BUNDLES=1`, `UIX_CAN_SHUTDOWN_RESTART_HOST=1` — feature switches for packaged installs.
- `HOMEBRIDGE_CONFIG_UI_TERMINAL=1` — enable the terminal. `HOMEBRIDGE_CONFIG_UI_PORT` — port override.
- `HOMEBRIDGE_CONFIG_UI=1` (Docker), `HOMEBRIDGE_SYNOLOGY_PACKAGE=1`, `HOMEBRIDGE_APT_PACKAGE=1`, `HOMEBRIDGE_MACOS_PACKAGE=1` — packaging-mode flags that toggle features like terminal access and host shutdown/restart.

`nodemon.json` shows the canonical dev invocation: `UIX_DEVELOPMENT=1 UIX_INSECURE_MODE=1 UIX_SERVICE_MODE=1 HOMEBRIDGE_CONFIG_UI_TERMINAL=1 node scripts/watch-supervisor.mjs tsx src/bin/hb-service.ts run --stdout`. The supervisor restarts hb-service after the UI exits cleanly (which is how it restarts itself after an update) — nodemon alone would just wait for a file change.

## Pull requests and the changelog

- **Always target the current beta branch (e.g. `beta-5.29.1`), never `latest`.** Find it with `git branch -a | grep beta`. The `pr-target-latest.yml` workflow fails PRs that target `latest`; only release PRs from a beta branch land there.
- Commit subjects and PR titles use Conventional Commits (`fix(plugins): …`, `feat: …`, `chore(deps): …`).
- **Every commit adds its own bullet to `CHANGELOG.md`**, in the same commit, at the **bottom** of the right section of the pending release (`## vX.Y.Z (Pending Release)`):
  - sections: `### Highlights`, `### UI Changes`, `### Other Changes`, `### Homebridge Dependencies`;
  - the bullet is the commit subject, plus `(#PR)` if not already in it, plus `(@user)` to credit an outside contributor;
  - `### Homebridge Dependencies` lists the homebridge-family package versions at that point (from the lockfile).

## Things that bite

- **ESM throughout**: both packages have `"type": "module"`. Local imports must use the `.js` extension even from `.ts` source (e.g. `import { Foo } from './foo.js'`). The compiled output is what runs.
- **Backend constructor params need `@Inject(Token)`**: e.g. `@Inject(ConfigService) private readonly configService: ConfigService`. `tsx` (used by `npm start` and `npm run watch`) emits no decorator metadata, so a param without `@Inject` is `undefined` **in dev only** — `tsc` builds and the SWC tests still work, which hides it.
- **Nest 12 does not inherit `@Optional()`**: a class that extends a Nest class with `@Optional()` params and has no constructor of its own fails with "Nest can't resolve dependencies". Redeclare the constructor with its own `@Optional()` params.
- **Angular `inject()` dies after the first `await`** (NG0203) in guards and other functional code. Capture what you need, or the `Injector`, before awaiting — `core/auth/guards/logs.guard.ts` uses `runInInjectionContext` for this.
- **Monaco assets are copied with name-specific globs** in `ui/angular.json` (to skip ~80 unused languages). Monaco renames its hashed chunks between versions, so a bump can silently drop files and leave the JSON config editor blank. `postbuild:ui` (`scripts/verify-monaco-assets.mjs`) catches this — fix the globs, don't skip the check.
- **Plugin install/update/uninstall endpoints return straight away ("queued")**; npm runs in the background through `queuePackageOperation()` in `plugins.service.ts`, one at a time. Never exit or restart the process while npm is running — it kills the npm child mid-write. Update-all relies on the same queue.
- **A second copy of the UI can shadow the running one**: `getBasePaths()` searches `customPluginPath` first, so an old copy there wins a name lookup. For the UI's own version, use `UIX_BASE_PATH` (`getHomebridgeUiPackage()`), not a plugin-list search.
- **Two `node_modules`**: if you change a dep in `ui/package.json`, run `npm install --prefix ui` — root `npm install` won't touch it.
- **Built UI is gitignored but shipped on publish**: `public/` is the compiled UI. It is in `.gitignore`, so `npm run build:ui` won't show up in `git status` — don't expect (or try to commit) a `public/` diff. It still reaches the npm package: `prepublishOnly` runs `npm run build` to regenerate it, and `.npmignore` (which npm uses in preference to `.gitignore` because it exists) does not exclude `public/`.
- **Translations**: `ui/src/i18n/en.json` is the source of truth; other locales are synced from it via `npm run lang-sync`. Don't hand-edit non-English files for new keys.
- **Patched dependencies**: `scripts/apply-patches.mjs` runs from `prepare` in both packages (it skips quietly on production installs). Patches live in `patches/` (`thread-stream`) and `ui/patches/` (`@ng-formworks/*`), named with the exact version. If you bump one of those packages, re-create the patch or it will fail to apply.
- **Install-script allow-list**: both `package.json` files have an `allowScripts` block — npm's install-script approval, one `true`/`false` per package (`false` denies). A new package with an install script makes npm prompt; approve it with `npm install-scripts approve <pkg>`.
