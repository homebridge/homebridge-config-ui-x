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
]
