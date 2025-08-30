# Homebridge Config UI X Development Instructions

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Project Overview

Homebridge Config UI X is a web-based management tool for Homebridge written in TypeScript. The project consists of:

- **Backend**: NestJS server using Fastify (src/)
- **Frontend**: Angular application (ui/)
- **Tests**: E2E test suite using Vitest (test/)

## Working Effectively

### Bootstrap and Dependencies

Run these commands to set up the development environment:

```bash
# Install root dependencies - takes ~30 seconds
npm install

# Install UI dependencies - takes ~17 seconds
cd ui && npm install && cd ..
```

### Build Process

```bash
# Build complete project - takes ~32 seconds total. NEVER CANCEL.
# Server builds instantly, UI compilation takes ~24 seconds
npm run build
```

**CRITICAL**: Set timeout to 60+ minutes for build commands. NEVER CANCEL builds.

### Testing

```bash
# Run complete test suite - takes ~43 seconds. NEVER CANCEL.
# Runs 195 E2E tests covering all API endpoints
npm run test
```

**CRITICAL**: Set timeout to 30+ minutes for test commands. Tests take 43 seconds to complete.

### Linting

```bash
# Run linter - takes ~17 seconds. Always run before committing.
npm run lint

# Auto-fix linting issues
npm run lint:fix
```

### Development Servers

#### Method 1: Watch Mode (Recommended for Full Development)

```bash
# Set up development storage directory
mkdir -p /tmp/homebridge-dev/.homebridge

# Create development config
cat > /tmp/homebridge-dev/.homebridge/config.json << 'EOF'
{
  "bridge": {
    "name": "Homebridge Development",
    "username": "CC:22:3D:E3:CE:30",
    "port": 51826,
    "pin": "031-45-154"
  },
  "accessories": [],
  "platforms": [
    {
      "name": "Config",
      "port": 8581,
      "platform": "config"
    }
  ]
}
EOF

# Start both UI (port 4200) and server (port 8581) in watch mode
UIX_STORAGE_PATH=/tmp/homebridge-dev/.homebridge UIX_CONFIG_PATH=/tmp/homebridge-dev/.homebridge/config.json npm run watch
```

#### Method 2: Individual Servers

```bash
# Start only the Angular UI development server (port 4200)
cd ui && npm start

# Start only the backend server (port 8581) - in separate terminal
UIX_STORAGE_PATH=/tmp/homebridge-dev/.homebridge UIX_CONFIG_PATH=/tmp/homebridge-dev/.homebridge/config.json UIX_DEVELOPMENT=1 UIX_INSECURE_MODE=1 npm run start
```

#### Method 3: Built Server

```bash
# Run the built server (requires npm run build first)
UIX_STORAGE_PATH=/tmp/homebridge-dev/.homebridge UIX_CONFIG_PATH=/tmp/homebridge-dev/.homebridge/config.json UIX_DEVELOPMENT=1 UIX_INSECURE_MODE=1 node dist/main.js
```

## Validation

### Always Validate Complete Workflows

After making changes, always run through these validation steps:

1. **Build Validation**:

   ```bash
   npm run build  # Must complete without errors
   ```

2. **Test Validation**:

   ```bash
   npm run test   # All 195 tests must pass
   ```

3. **Lint Validation**:

   ```bash
   npm run lint   # Must pass with zero warnings
   ```

4. **Manual Functional Testing**:
   - Start development server and verify it responds:
     ```bash
     curl -I http://localhost:8581
     ```
   - Verify the Swagger API docs are accessible at http://localhost:8581/swagger
   - Access the main UI HTML at http://localhost:8581
   - For full UI testing, access http://localhost:4200 (development) or http://localhost:8581 (built) in a browser
   - Complete setup wizard if required, then login with default credentials: `admin` / `admin`
   - Navigate through key pages: Status, Plugins, Config Editor, Logs

### Manual Testing Scenarios

Always test these critical user scenarios after making changes:

1. **Server Functionality**:
   - Verify server starts without errors
   - Verify server responds to HTTP requests
   - Verify Swagger API documentation loads at http://localhost:8581/swagger

2. **UI Access**:
   - Access the main UI (loads Angular application)
   - Complete setup wizard if prompted (first-time setup)
   - Login with username `admin` and password `admin`
   - Verify dashboard loads successfully

3. **Core Features** (after login):
   - **Config Editor**: Navigate to Config tab, verify JSON loads and is editable
   - **Plugins Page**: Navigate to Plugins tab, verify installed plugins list loads
   - **Status Page**: Verify system information displays
   - **Logs Page**: Verify log viewer functions

4. **API Functionality**:
   - Access http://localhost:8581/swagger
   - Verify API documentation loads properly
   - Test API endpoints using Swagger UI (requires authentication)

## Environment Requirements

### Node.js Version

- **Required**: Node.js ^20.19.0 || ^22.12.0 || ^24.0.0
- **Check version**: `node --version`

### Required Environment Variables for Development

```bash
UIX_STORAGE_PATH=/tmp/homebridge-dev/.homebridge     # Development storage path
UIX_CONFIG_PATH=/tmp/homebridge-dev/.homebridge/config.json  # Config file location
UIX_DEVELOPMENT=1                                    # Enable development mode
UIX_INSECURE_MODE=1                                 # Disable HTTPS requirements
```

### Default Credentials

- **Username**: `admin`
- **Password**: `admin`

### Ports

- **UI Development Server**: http://localhost:4200
- **Backend Server**: http://localhost:8581
- **Swagger API Docs**: http://localhost:8581/swagger

## Common Development Tasks

### Key Directories

- `src/`: Server-side TypeScript code (NestJS application)
- `src/modules/`: Core business logic modules
  - `config-editor/`: Configuration management
  - `plugins/`: Plugin installation and management
  - `accessories/`: HomeKit accessory control
  - `backup/`: Backup and restore functionality
  - `status/`: System status monitoring
  - `users/`: User management
- `ui/`: Angular frontend application
- `ui/src/app/`: Angular components and services
- `ui/src/i18n/`: Internationalization files
- `test/e2e/`: End-to-end test files
- `dist/`: Built server files (created after `npm run build`)
- `public/`: Built UI files (created after `npm run build`)

### Making Changes

1. **Server Changes**: Edit files in `src/`, server auto-reloads in watch mode
2. **UI Changes**: Edit files in `ui/src/`, Angular dev server auto-reloads
3. **Always run linting**: `npm run lint` before committing
4. **Always test changes**: Run the manual validation scenarios above

### Debugging

- **Server logs**: Visible in console when running development server
- **UI debugging**: Open browser dev tools at localhost:4200
- **API testing**: Use Swagger UI at localhost:8581/swagger
- **Tests debugging**: Run `npm run test` to see detailed test output

## Critical Reminders

- **NEVER CANCEL** build or test commands - they may take 30+ seconds but must complete
- **ALWAYS** set development environment variables when running servers
- **ALWAYS** install dependencies in both root AND ui/ directories
- **ALWAYS** run linting before committing changes
- **ALWAYS** test both UI and server components after changes
- **ALWAYS** validate using the manual testing scenarios above

## Troubleshooting

### Common Issues

1. **Permission denied errors**: Ensure you're using the development storage path (`/tmp/homebridge-dev/.homebridge`)
2. **Port conflicts**: Check that ports 4200 and 8581 are available
3. **Build failures**: Ensure all dependencies are installed in both root and ui/ directories
4. **Login failures**: Use default credentials `admin`/`admin`

### Quick Reset

```bash
# Clean and rebuild everything
rm -rf node_modules ui/node_modules dist public
npm install && cd ui && npm install && cd ..
npm run build
```
