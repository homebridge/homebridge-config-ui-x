import { TranslateService } from '@ngx-translate/core'

/**
 * JSON-schema fragment for a bridge's `matter` field, shared between the main
 * bridge schema (config-editor) and the child bridge schema so the two cannot
 * drift apart. Returns the `matter` object schema only — each call site keeps
 * its own guard for whether to include the `matter` key at all (the main
 * bridge gates on Matter support; child bridges additionally require a platform
 * plugin).
 *
 * When externalsOnly is supported (Homebridge >= 2.0.3-beta.26) an
 * `externalsOnly` flag is exposed alongside `enabled` and `port`. When
 * disableIpv4 is supported (Homebridge >= 2.2.0) a `disableIpv4` flag is
 * exposed too.
 *
 * @param translate - The translation service for localized titles
 * @param isProtocolExternalsOnlyEnabled - Whether the running Homebridge supports the externalsOnly mode
 * @param scope - `'main'` for the main bridge or `'child'` for a child bridge; selects the description wording
 * @param isMatterDisableIpv4Enabled - Whether the running Homebridge supports the disableIpv4 option
 * @returns The JSON schema fragment for the `matter` property
 */
export function createMatterSchema(translate: TranslateService, isProtocolExternalsOnlyEnabled: boolean, scope: 'child' | 'main', isMatterDisableIpv4Enabled = false) {
  const disabledDescription = scope === 'main'
    ? 'When false, Matter is configured but not advertised for the main bridge; the config and on-disk commissioning data are preserved.'
    : 'When false, Matter is configured but not advertised for this child bridge; the config and on-disk commissioning data are preserved.'

  return {
    type: 'object',
    additionalProperties: false,
    title: translate.instant('settings.matter.title'),
    description: scope === 'main'
      ? 'Matter-specific configuration for the main bridge.'
      : 'Matter-specific configuration for this child bridge.',
    properties: {
      enabled: {
        type: 'boolean',
        title: translate.instant('matter_bridge.config.use'),
        description: disabledDescription,
      },
      port: {
        type: 'number',
        title: translate.instant('settings.matter.port'),
        description: translate.instant('settings.matter.port_desc'),
        minimum: 1025,
        maximum: 65534,
      },
      ...isProtocolExternalsOnlyEnabled
        ? {
            externalsOnly: {
              type: 'boolean',
              title: translate.instant('child_bridge.config.matter_externals_only'),
              description: 'When true, the Matter bridge node is not advertised but plugins may still publish external Matter accessories. Requires matter.enabled: false.',
            },
          }
        : {},
      ...isMatterDisableIpv4Enabled
        ? {
            disableIpv4: {
              type: 'boolean',
              title: translate.instant('settings.matter.disable_ipv4'),
              description: translate.instant('settings.matter.disable_ipv4_desc'),
            },
          }
        : {},
    },
  }
}
