# Homebridge Config UI X

Homebridge Config UI X is a web-based management tool for Homebridge written in TypeScript using Nest.js for the server backend and Angular for the client frontend.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

- Bootstrap, build, and test the repository:
  - Install dependencies: `npm install && cd ui && npm install && cd ..` - takes 45 seconds total (main: 30s, ui: 15s)
  - Full build: `npm run build` - takes 32 seconds total. NEVER CANCEL. Set timeout to 60+ minutes.
    - Server build: `npm run build:server` - takes 7 seconds
    - UI build: `npm run build:ui` - takes 24 seconds (Angular production build)
  - Lint check: `npm run lint` - takes 18 seconds. NEVER CANCEL. Set timeout to 30+ minutes.
  - Fix linting issues: `npm run lint:fix` - takes 17 seconds
  - Run tests: `npm run test` - takes 44 seconds with 195 e2e tests. NEVER CANCEL. Set timeout to 30+ minutes.
  - Run tests with coverage: `npm run test-coverage` - takes 46 seconds. NEVER CANCEL. Set timeout to 60+ minutes.

- Development workflow:
  - Start development servers: `npm run watch` - starts both UI dev server (port 4200) and backend watch mode
  - Start backend only: `npm start` - runs on port 8080 by default
  - Start UI dev server only: `cd ui && npm start` - runs on port 4200
  - Translation sync: `npm run lang-sync` - takes 18 seconds, syncs translation files

## Node.js Requirements

- **CRITICAL**: Node.js version requirements: ^20.19.0 || ^22.12.0 || ^24.0.0
- npm version: 10.8.2+ recommended
- Current validated version: Node.js v20.19.4 with npm 10.8.2

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

- **MANUAL VALIDATION REQUIREMENT**: Always test functionality after making changes by running the application and verifying it responds correctly on port 8080 (backend) or 4200 (UI dev server).
- Test the web interface: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/` should return `200`
- Web interface title should be: `<title>Homebridge</title>`
- **Always run complete build and test cycle before finalizing changes**: `npm run build && npm run lint && npm run test`
- The watch mode (`npm run watch`) allows live development with automatic rebuilds.

## Project Structure

### Backend (Nest.js) - `/src/`

- **Main entry**: `src/main.ts`
- **Core modules**: `src/modules/` contains all feature modules:
  - `accessories/` - HomeKit accessory management
  - `backup/` - System backup and restore
  - `config-editor/` - Homebridge config.json editor
  - `plugins/` - Plugin installation and management
  - `platform-tools/` - System tools and terminal access
  - `server/` - Server management and control
  - `status/` - System status and monitoring
  - `users/` - User authentication and management
- **Service binary**: `src/bin/hb-service.ts` - Service management tool

### Frontend (Angular) - `/ui/src/`

- **Main entry**: `ui/src/main.ts`
- **App modules**: `ui/src/app/modules/` mirrors backend functionality:
  - `config-editor/` - Configuration editor UI
  - `plugins/` - Plugin management interface
  - `status/` - Dashboard and system status
  - `settings/` - Application settings
  - `platform-tools/` - Terminal and system tools UI
- **Translations**: `ui/src/i18n/` contains language files (en.json is master)

### Tests - `/test/`

- **E2E tests**: `test/e2e/` contains end-to-end integration tests
- **Test config**: Uses Vitest with comprehensive coverage reporting
- **Mock data**: `test/mocks/` contains test fixtures

## Common Tasks

### Building and Testing

```bash
# Full clean build
npm install && cd ui && npm install && cd .. && npm run build

# Run all validations (run this before committing)
npm run lint && npm run test

# Development with live reload
npm run watch  # Runs both UI (port 4200) and backend watch mode
```

### hb-service Commands

The built service tool is available at `dist/bin/hb-service.js`:

```bash
node dist/bin/hb-service.js --help  # Show all available commands
```

### Translation Management

```bash
npm run lang-sync  # Sync translation keys across all language files
```

## CRITICAL Build Timing Warnings

- **NEVER CANCEL**: Build takes 32 seconds total. Always set timeout to 60+ minutes.
- **NEVER CANCEL**: Test suite takes 44 seconds. Always set timeout to 30+ minutes.
- **NEVER CANCEL**: UI build takes 24 seconds. This is normal for Angular production builds.
- **NEVER CANCEL**: Test coverage takes 46 seconds. Always set timeout to 60+ minutes.

## Development Dependencies

The project uses these main frameworks:

- **Backend**: Nest.js with Fastify, TypeScript
- **Frontend**: Angular 20.x with Bootstrap 5, Monaco Editor
- **Testing**: Vitest with e2e testing
- **Build**: TypeScript compiler, Angular CLI

## Validation Scenarios

After making changes, always test these scenarios:

1. **Build verification**: `npm run build` completes successfully
2. **Lint verification**: `npm run lint` passes with 0 warnings
3. **Test verification**: `npm run test` passes all 195 tests
4. **Application startup**: App starts and responds on port 8080
5. **UI development**: `npm run watch` starts both servers successfully

## Key Configuration Files

- `package.json` - Main project dependencies and scripts
- `ui/package.json` - Frontend dependencies and Angular configuration
- `tsconfig.json` / `tsconfig.build.json` - TypeScript configuration
- `vitest.config.js` - Test configuration
- `eslint.config.js` - Linting rules
- `nest-cli.json` - Nest.js CLI configuration
- `ui/angular.json` - Angular CLI configuration

## Troubleshooting

- **Permission errors in watch mode**: Expected when not running as root, UI development still works
- **Port conflicts**: Backend uses 8080, UI dev server uses 4200
- **Build failures**: Check Node.js version matches requirements (^20.19.0 || ^22.12.0 || ^24.0.0)
- **Test failures**: Ensure storage paths are properly configured and accessible
