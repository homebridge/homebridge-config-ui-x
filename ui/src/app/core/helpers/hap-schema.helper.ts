import { TranslateService } from '@ngx-translate/core'

/**
 * JSON-schema fragment for a bridge's `hap` field, shared between the main
 * bridge schema (config-editor) and the child bridge schema so the two cannot
 * drift apart.
 *
 * When externalsOnly is supported (Homebridge >= 2.0.3-beta.26) the field
 * accepts both the nested object form `{ enabled?, externalsOnly? }` and the
 * legacy boolean — so configs written by older UI versions (or against older
 * runtimes) stay valid. Otherwise it is a plain boolean.
 *
 * @param translate - The translation service for localized titles
 * @param isProtocolExternalsOnlyEnabled - Whether the running Homebridge supports the nested HAP shape and externalsOnly mode
 * @param scope - `'main'` for the main bridge or `'child'` for a child bridge; selects the description wording
 * @returns The JSON schema fragment for the `hap` property
 */
export function createHapSchema(translate: TranslateService, isProtocolExternalsOnlyEnabled: boolean, scope: 'child' | 'main') {
  const disabledDescription = scope === 'main'
    ? 'When false, HAP is not advertised for the main bridge.'
    : 'When false, HAP is not advertised for this child bridge.'

  if (!isProtocolExternalsOnlyEnabled) {
    return {
      type: 'boolean',
      title: translate.instant('child_bridge.config.enable_hap'),
      description: disabledDescription,
    }
  }

  return {
    // Nested form for Homebridge >= 2.0.3-beta.26. Boolean is still accepted so
    // configs written by older UI versions (or older runtimes) remain valid.
    oneOf: [
      { type: 'boolean' },
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: {
            type: 'boolean',
            title: translate.instant('child_bridge.config.enable_hap'),
            description: disabledDescription,
          },
          externalsOnly: {
            type: 'boolean',
            title: translate.instant('child_bridge.config.hap_externals_only'),
            description: 'When true, the bridge accessory itself is not published but plugins may still publish external HAP accessories. Requires hap.enabled: false.',
          },
        },
      },
    ],
    title: translate.instant('child_bridge.config.enable_hap'),
    description: scope === 'main'
      ? 'HAP configuration for the main bridge.'
      : 'HAP configuration for this child bridge.',
  }
}
