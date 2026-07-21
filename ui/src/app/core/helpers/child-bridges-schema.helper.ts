import { TranslateService } from '@ngx-translate/core'

import { createHapSchema } from './hap-schema.helper'
import { createMatterSchema } from './matter-schema.helper'

export interface ChildBridgeSchemaOptions {
  isDebugModeEnabled: boolean
  isMatterSupported: boolean
  isPlatformPlugin?: boolean
  /**
   * When true (Homebridge >= 2.0.3-beta.26), the `hap` field accepts the
   * nested object form `{ enabled?, externalsOnly? }` and `matter` accepts an
   * `externalsOnly` flag. Schema still allows the legacy boolean form for
   * `hap` so configs written by older UI versions remain valid.
   */
  isProtocolExternalsOnlyEnabled?: boolean
  /**
   * When true (Homebridge >= 2.2.0), `matter` accepts a `disableIpv4` flag
   * that makes the Matter mDNS responder IPv6-only.
   */
  isMatterDisableIpv4Enabled?: boolean
  /**
   * When true (Homebridge >= 2.2.2-beta.0), `hap` accepts a
   * `disableIdentifyingMaterial` flag.
   */
  isHapDisableIdentifyingMaterialEnabled?: boolean
}

/**
 * Creates the JSON schema definition for child bridge configuration
 * @param translate - The translation service for localized strings
 * @param options - Configuration options
 * @param options.isDebugModeEnabled - Whether debug mode is enabled to include the debug option
 * @param options.isMatterSupported - Whether Matter support is enabled to include Matter settings
 * @param options.isPlatformPlugin - Whether the plugin is platform-based (Matter only works with platform plugins)
 * @param options.isProtocolExternalsOnlyEnabled - Whether the running Homebridge supports the nested HAP shape and externalsOnly mode
 * @param options.isMatterDisableIpv4Enabled - Whether the running Homebridge supports the Matter disableIpv4 option
 * @param options.isHapDisableIdentifyingMaterialEnabled - Whether the running Homebridge supports the HAP disableIdentifyingMaterial option
 * @returns Child bridge schema object
 */
export function createChildBridgeSchema(translate: TranslateService, { isDebugModeEnabled, isMatterSupported, isPlatformPlugin = true, isProtocolExternalsOnlyEnabled = false, isMatterDisableIpv4Enabled = false, isHapDisableIdentifyingMaterialEnabled = false }: ChildBridgeSchemaOptions) {
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
      hap: createHapSchema(translate, isProtocolExternalsOnlyEnabled, 'child', isHapDisableIdentifyingMaterialEnabled),
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
      ...(isMatterSupported && isPlatformPlugin)
        ? { matter: createMatterSchema(translate, isProtocolExternalsOnlyEnabled, 'child', isMatterDisableIpv4Enabled) }
        : {},
    },
  }
}
