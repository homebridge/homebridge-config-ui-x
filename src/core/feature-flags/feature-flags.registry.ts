/**
 * Feature Flags Registry
 * This file defines all feature flags and their minimum version requirements.
 */

export interface FeatureFlagDefinition {
  /**
   * Unique identifier for the feature flag
   */
  key: string

  /**
   * Human-readable description of the feature
   */
  description: string

  /**
   * Homebridge version semver range required for this feature
   */
  range: string
}

/**
 * Registry of all feature flags
 */
export const FEATURE_FLAGS: FeatureFlagDefinition[] = [
  {
    key: 'childBridgeDebugMode',
    description: 'Enables debug mode configuration for child bridges',
    range: '>=2.0.0-alpha.0',
  },
  {
    key: 'matterSupport',
    description: 'Enables support for Matter bridges',
    range: '>=2.0.0-beta.71',
  },
  {
    key: 'hapBridgeDisable',
    description: 'Enables disabling HAP per bridge (main and child) and reflects HAP status in widgets',
    range: '^2.0.1-beta.0',
  },
  {
    key: 'externalAccessoriesAttribution',
    description: 'Surfaces plugin attribution + QR codes for externally-published HAP and Matter accessories. Requires the homebridge runtime to write externalAccessories.<MAC>.json index files.',
    range: '>=2.0.3-beta.18',
  },
  {
    key: 'disableAllProtocols',
    description: 'Allows disabling both HAP and Matter on a bridge (main and platform child bridges), leaving it with no advertised protocols. Requires the homebridge runtime to accept configs where neither protocol is enabled.',
    range: '>=2.0.3-beta.21',
  },
  {
    key: 'matterDisableInPlace',
    description: 'Disables Matter without tearing it down: sets matter.enabled=false and preserves the config + on-disk commissioning storage, so re-enabling does not require re-commissioning. Requires the homebridge runtime to honour matter.enabled (older versions treat the block\'s presence as enabled).',
    range: '>=2.0.3-beta.22',
  },
  {
    key: 'matterMonitoringAck',
    description: 'Homebridge core echoes the request\'s correlationId on its monitoringStarted/Stopped acks. Lets the UI gate its first getMatterAccessories on the ack instead of racing core\'s Matter init — without the echo, the UI dispatcher drops the reply and we fall back to the pre-ack behaviour.',
    range: '>=2.0.3-beta.24',
  },
  {
    key: 'protocolExternalsOnly',
    description: 'Nested HAP bridge config (`hap: { enabled?, externalsOnly? }`) and `externalsOnly` mode for both HAP and Matter. When set, the bridge accessory/node itself is not advertised but plugins may still publish external accessories. Requires the homebridge runtime to accept the new nested HAP shape; older runtimes still understand the boolean form.',
    range: '>=2.0.3-beta.26',
  },
]
