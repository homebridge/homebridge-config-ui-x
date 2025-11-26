import { TranslateService } from '@ngx-translate/core'

/**
 * Creates the JSON schema definition for child bridge configuration
 * @param translate - The translation service for localized strings
 * @param options - Configuration options
 * @param options.isDebugModeEnabled - Whether debug mode is enabled to include the debug option
 * @returns Child bridge schema object
 */
export function createChildBridgeSchema(translate: TranslateService, { isDebugModeEnabled }) {
  return {
    type: 'object',
    required: ['username'],
    additionalProperties: false,
    title: translate.instant('child_bridge.bridge_settings'),
    properties: {
      username: {
        type: 'string',
        title: translate.instant('users.label_username'),
        description: 'The child bridge username must be 6 pairs of colon-separated hexadecimal characters (A-F 0-9).\n'
          + 'Example: 0E:89:49:64:91:86.',
        pattern: '^([A-Fa-f0-9]{2}:){5}[A-Fa-f0-9]{2}$',
      },
      port: {
        type: 'number',
        title: translate.instant('accessories.bridge_port'),
        description: 'The port the child bridge listens on.',
        minimum: 1025,
        maximum: 65534,
      },
      pin: {
        type: 'string',
        title: 'Bridge PIN',
        description: 'The child bridge pin.\n'
          + 'Example: 630-27-655.',
        pattern: '^([0-9]{3}-[0-9]{2}-[0-9]{3})$',
      },
      name: {
        type: 'string',
        title: translate.instant('child_bridge.config.name'),
        description: 'The name of the child bridge.',
        maxLength: 64,
      },
      manufacturer: {
        type: 'string',
        title: translate.instant('child_bridge.config.manufacturer'),
        description: 'The child bridge manufacturer to be displayed in HomeKit.',
        maxLength: 32,
      },
      firmwareRevision: {
        type: 'string',
        title: translate.instant('child_bridge.config.firmware'),
        description: 'The child bridge firmware version to be displayed in HomeKit.',
        maxLength: 64,
      },
      model: {
        type: 'string',
        title: translate.instant('child_bridge.config.model'),
        description: 'The child bridge model to be displayed in HomeKit.',
        maxLength: 32,
      },
      ...isDebugModeEnabled
        ? {
            debugModeEnabled: {
              type: 'boolean',
              title: 'Debug Mode',
              description: 'Enable verbose logging for debugging.',
            },
          }
        : {},
      env: {
        type: 'object',
        additionalProperties: false,
        title: 'Environment Variables',
        description: 'Environment variables to set for this child bridge.',
        properties: {
          DEBUG: {
            type: 'string',
            title: 'DEBUG',
            description: translate.instant('settings.service.debug_tooltip'),
          },
          NODE_OPTIONS: {
            type: 'string',
            title: 'NODE_OPTIONS',
            description: translate.instant('settings.service.node_tooltip'),
          },
        },
      },
    },
  }
}
