# Trigger Update API

## Overview

The Trigger Update API provides a REST endpoint that allows external plugins (like `homebridge-plugin-update-check`) to programmatically trigger updates for Homebridge, homebridge-config-ui-x, or any installed Homebridge plugin.

## Endpoint

```
POST /plugins/trigger-update
```

### Authentication

This endpoint requires admin authentication via Bearer token.

```http
Authorization: Bearer <your-token>
```

### Request Body

```typescript
{
  "name": string,      // Required: Package name to update
  "version": string    // Optional: Target version (defaults to "latest")
}
```

#### Valid Package Names

- `homebridge` - The Homebridge core package
- `homebridge-config-ui-x` - The Homebridge Config UI X package
- Any valid Homebridge plugin name matching the pattern: `homebridge-*` or `@scope/homebridge-*`

### Response

#### Success (201 Created)

```json
{
  "message": "Update for homebridge-example-plugin to version 1.2.3 has been queued and will be performed in the background.",
  "name": "homebridge-example-plugin",
  "version": "1.2.3",
  "status": "queued"
}
```

#### Error Responses

**404 Not Found** - Package is not installed
```json
{
  "statusCode": 404,
  "message": "Plugin homebridge-example-plugin is not installed.",
  "error": "Not Found"
}
```

**400 Bad Request** - Invalid package name
```json
{
  "statusCode": 400,
  "message": "Invalid package name. Must be \"homebridge\", \"homebridge-config-ui-x\", or a valid Homebridge plugin name.",
  "error": "Bad Request"
}
```

**401 Unauthorized** - Missing or invalid authentication
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

## Usage Examples

### Update a Plugin to Latest Version

```bash
curl -X POST http://localhost:8080/plugins/trigger-update \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "homebridge-example-plugin"
  }'
```

### Update a Plugin to Specific Version

```bash
curl -X POST http://localhost:8080/plugins/trigger-update \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "homebridge-example-plugin",
    "version": "1.2.3"
  }'
```

### Update Homebridge Core

```bash
curl -X POST http://localhost:8080/plugins/trigger-update \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "homebridge"
  }'
```

### Update homebridge-config-ui-x

```bash
curl -X POST http://localhost:8080/plugins/trigger-update \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "homebridge-config-ui-x"
  }'
```

**Note:** When updating `homebridge-config-ui-x`, the server will automatically restart after 5 seconds to apply the update.

## JavaScript/TypeScript Example

```typescript
import axios from 'axios';

async function triggerPluginUpdate(pluginName: string, version?: string) {
  try {
    const response = await axios.post('http://localhost:8080/plugins/trigger-update', {
      name: pluginName,
      version: version || 'latest'
    }, {
      headers: {
        'Authorization': `Bearer ${YOUR_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Update queued:', response.data);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('Update failed:', error.response.data);
    } else {
      console.error('Request failed:', error.message);
    }
    throw error;
  }
}

// Usage
await triggerPluginUpdate('homebridge-example-plugin', '1.2.3');
```

## Behavior

1. **Validation**: The endpoint first validates:
   - The package name is valid
   - The package is installed
   - The target version exists (if specified)

2. **Asynchronous Execution**: The update is queued and executed in the background using `setImmediate()`. The endpoint returns immediately with a success response.

3. **Update Process**: The update process:
   - Uses npm to install the specified version
   - Logs all output to the Homebridge logs
   - Handles errors gracefully
   - For `homebridge-config-ui-x`, triggers an automatic restart after 5 seconds

4. **Restart Requirement**: After updating plugins or Homebridge, a restart of the Homebridge service is typically required to apply the changes. The endpoint does NOT automatically restart Homebridge (except for `homebridge-config-ui-x`).

## Integration with homebridge-plugin-update-check

This endpoint is designed to be used by plugins like `homebridge-plugin-update-check` to provide automated update capabilities. Example integration:

```typescript
// In your plugin code
async function checkAndUpdatePlugin(pluginName: string) {
  // Check if update is available
  const updateAvailable = await checkForUpdate(pluginName);
  
  if (updateAvailable) {
    // Trigger the update via Config UI X API
    const response = await fetch('http://localhost:8080/plugins/trigger-update', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: pluginName,
        version: updateAvailable.version
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      this.log.info(`Update queued for ${pluginName}: ${result.message}`);
    }
  }
}
```

## Security Considerations

- This endpoint requires admin-level authentication
- Only installed packages can be updated
- Package names are validated against known patterns
- The update process runs with the same permissions as the Homebridge Config UI X server
- Malformed requests are rejected with appropriate error messages

## Logging

All update operations are logged to the Homebridge logs with the format:
```
[11/2/2024, 6:14:18 PM] Starting scheduled update for homebridge-example-plugin to version 1.2.3
[11/2/2024, 6:14:25 PM] [homebridge-example-plugin update] npm install output...
[11/2/2024, 6:14:30 PM] Successfully updated homebridge-example-plugin to version 1.2.3. Restart required.
```

## Error Handling

Failed updates are logged with full error details:
```
[11/2/2024, 6:14:18 PM] Failed to update homebridge-example-plugin: Error message details
```

The endpoint itself will not throw errors for background update failures, as the update happens asynchronously after the response is sent.
