# Homebridge Config UI X

Homebridge Config UI X is a web-based management tool for Homebridge written in TypeScript using Nest.js (with Fastify) for the server backend and Angular for the client frontend.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Pull Request Guidelines

**CRITICAL**: Always create pull requests against the current beta branch, NOT the main/latest branch.

- **Target Branch**: Always target the current beta branch (typically named `beta-X.Y.Z`, e.g., `beta-5.24.1`)
- **Finding the Current Beta Branch**: Use `git branch -a | grep beta` or check the GitHub repository branches to identify the latest beta branch
- **Never target**: `main`, `latest`, or any other non-beta branch unless explicitly instructed otherwise
- **Branch Naming**: When creating feature branches, use descriptive names like `copilot/fix-XXXX` or `feature/description`

This ensures all changes go through the beta testing process before being merged to production releases.

## Working Effectively

- Bootstrap, build, and test the repository:
  - Install dependencies: `npm install && npm install --prefix ui` — the root and `ui/` are separate npm packages with separate `node_modules`; installing only the root is not enough
  - Full build: `npm run build` - takes about 30 seconds. NEVER CANCEL. Set timeout to 60+ minutes.
    - Server build: `npm run build:server` - compiles `src/` to `dist/`
    - UI build: `npm run build:ui` - Angular production build, compiles `ui/src/` to `public/` (note: `public/` is gitignored, so a successful UI build produces no `git status` diff)
  - Lint check: `npm run lint` - covers both packages, zero warnings allowed. NEVER CANCEL. Set timeout to 30+ minutes.
  - Fix linting issues: `npm run lint:fix`
  - Run tests: `npm run test` - full e2e suite (~590 tests), takes about a minute. Tests run serially by design (`fileParallelism: false`) because they share filesystem state. NEVER CANCEL. Set timeout to 30+ minutes.
  - Run a single test file: `npm run test -- test/e2e/auth.e2e-spec.ts`
  - Run tests with coverage: `npm run test-coverage`. NEVER CANCEL. Set timeout to 60+ minutes.

- Development workflow:
  - Start development servers: `npm run watch` - starts the Angular dev server on port 4200 and the backend (via `hb-service`) on port 8581. The dev UI at :4200 is hard-coded to talk to the backend at :8581 (see `ui/src/environments/environment.ts`).
  - Start backend only: `npm start` - standalone mode; defaults to port 8080 when the config has no port set
  - Start UI dev server only: `npm start --prefix ui` - runs on port 4200
  - Translation sync: `npm run lang-sync` - syncs translation keys across all language files (`ui/src/i18n/en.json` is the master; never hand-edit the other locales)

## Node.js Requirements

- **CRITICAL**: Node.js version requirements: `^22.12.0 || ^24.0.0` (see `engines` in `package.json`)

## Environment Setup

For development and testing, set these environment variables:

```bash
UIX_DEVELOPMENT=1
UIX_INSECURE_MODE=1
UIX_SERVICE_MODE=1
HOMEBRIDGE_CONFIG_UI_TERMINAL=1
UIX_STORAGE_PATH=/tmp/homebridge  # or your preferred storage path
```

Create a basic homebridge config for testing:

```bash
mkdir -p /tmp/homebridge
echo '{"bridge": {"name": "Test", "username": "CC:22:3D:E3:CE:32", "port": 51826, "pin": "031-45-154"}, "accessories": [], "platforms": []}' > /tmp/homebridge/config.json
```

## Validation

- **MANUAL VALIDATION REQUIREMENT**: Always test functionality after making changes by running the application and verifying it responds correctly (port 8581 backend / 4200 UI when using `npm run watch`).
- Test the web interface: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8581/` should return `200`
- Web interface title should be: `<title>Homebridge</title>`
- **Always run complete build and test cycle before finalizing changes**: `npm run build && npm run lint && npm run test`
- The watch mode (`npm run watch`) allows live development with automatic rebuilds.

## Project Structure

Both packages are ESM (`"type": "module"`): local imports must use the `.js` extension even from `.ts` source (e.g. `import { Foo } from './foo.js'`).

### Backend (Nest.js) - `/src/`

- **Main entry**: `src/main.ts` - builds the Nest app on Fastify; API at `/api`, Swagger at `/swagger`, SPA served from `public/`
- **Infrastructure**: `src/core/` - `auth` (JWT + passport, HTTP and WebSocket guards), `config`, `homebridge-ipc` (talks to the running Homebridge process over Node IPC), `node-pty` (terminal), `spa`, `ssl`, and others
- **Feature modules**: `src/modules/` - `accessories`, `backup`, `child-bridges`, `config-editor`, `custom-plugins`, `log`, `platform-tools`, `plugins`, `server`, `setup-wizard`, `status`, `users`
- **Service binary**: `src/bin/hb-service.ts` - service management tool (exposed as the `hb-service` bin); platform installers in `src/bin/platforms/`

### Frontend (Angular) - `/ui/src/`

- **Main entry**: `ui/src/main.ts`
- **Core services**: `ui/src/app/core/` - `communication/` (HTTP API + socket.io services), `auth/` (JWT handling)
- **App modules**: `ui/src/app/modules/` mirrors the backend feature modules - when adding a feature, expect to touch a backend module and its UI counterpart
- **Translations**: `ui/src/i18n/` contains language files (`en.json` is master; sync others with `npm run lang-sync`)
- **Patched deps**: `ui/patches/` contains `patch-package` patches for `@ng-formworks/*`, applied on `npm install` in `ui/`

### Tests - `/test/`

- **E2E tests**: `test/e2e/` - each spec boots a real Nest testing module against a temp storage dir (`test/.homebridge`) seeded from `test/mocks/`
- **Test runner**: Vitest with SWC; there are no isolated unit tests

## CRITICAL Build Timing Warnings

- **NEVER CANCEL** builds, lints, or tests — they are all expected to complete within a few minutes, but always set generous timeouts (30-60+ minutes) rather than cancelling.

## Development Dependencies

The project uses these main frameworks:

- **Backend**: Nest.js with Fastify, TypeScript
- **Frontend**: Angular 22 with Bootstrap 5 (ng-bootstrap), Monaco Editor, xterm
- **Testing**: Vitest e2e suite
- **Build**: TypeScript compiler, Angular CLI

## Troubleshooting

- **Permission errors in watch mode**: Expected when not running as root, UI development still works
- **Port conflicts**: Backend uses 8581 in watch mode (8080 standalone default), UI dev server uses 4200
- **Build failures**: Check Node.js version matches requirements (`^22.12.0 || ^24.0.0`)
- **npm install-script prompts**: both `package.json` files have an `allowScripts` block; approvals are pinned to exact versions, so after bumping an approved package run `npm install-scripts approve <pkg>` again
- **Test failures**: Ensure storage paths are properly configured and accessible
